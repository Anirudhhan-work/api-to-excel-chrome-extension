// Background Service Worker for API Interception, Persistent Execution & JSON-to-CSV Converter (TypeScript)
import { InterceptedApiRequest, ApiExtensionMessage, ActiveJobState } from '../types';

// In-memory store of intercepted API requests grouped by Tab ID
const tabRequestsMap = new Map<number, Map<string, InterceptedApiRequest>>();

// Persistent Background Job & UI State
let activeJobState: ActiveJobState = {
  status: 'idle',
  progressMessage: '',
  data: [],
  selectedReqId: null,
  customApiUrl: '',
  jsonPath: '',
  startPage: 1,
  endPage: 5,
  itemsPerPage: 50,
  fileName: 'json_extracted_data',
  sheetName: 'Data',
  error: null
};

// Restore persistent job state from chrome.storage.local on startup
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(['activeJobState'], (result) => {
    if (result && result.activeJobState) {
      activeJobState = { ...activeJobState, ...result.activeJobState };
    }
  });
}

function saveStateToStorage() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ activeJobState });
  }
}

// Helper to extract query params from URL
function parseQueryParams(urlString: string): Record<string, string> {
  const params: Record<string, string> = {};
  try {
    const url = new URL(urlString);
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
  } catch (e) {
    // Ignore invalid URLs
  }
  return params;
}

// Detect pagination query parameter names
function detectPaginationParams(queryParams: Record<string, string>): { pageParam?: string; limitParam?: string } {
  const pageKeys = ['page', 'p', 'page_num', 'pagenumber', 'offset', 'skip', 'start'];
  const limitKeys = ['limit', 'size', 'per_page', 'pagesize', 'count', 'length', 'take'];

  let pageParam: string | undefined;
  let limitParam: string | undefined;

  for (const key of Object.keys(queryParams)) {
    const lower = key.toLowerCase();
    if (!pageParam && pageKeys.includes(lower)) pageParam = key;
    if (!limitParam && limitKeys.includes(lower)) limitParam = key;
  }

  return { pageParam, limitParam };
}

// Intercept outgoing HTTP requests
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!details.url || details.tabId < 0) return;

    const url = details.url;
    const isXhrOrFetch = details.type === 'xmlhttprequest' || (details.type as string) === 'fetch';
    const isApiUrl = (
      url.includes('/api/') ||
      url.includes('/v1/') ||
      url.includes('/v2/') ||
      url.includes('/v3/') ||
      url.includes('/graphql') ||
      url.includes('.json') ||
      /[?&](page|limit|offset|size|skip|p)=/i.test(url)
    );

    if (!isXhrOrFetch && !isApiUrl) return;

    const headers: Record<string, string> = {};
    if (details.requestHeaders) {
      details.requestHeaders.forEach(h => {
        if (h.name && h.value) {
          headers[h.name] = h.value;
        }
      });
    }

    const queryParams = parseQueryParams(url);
    const { pageParam, limitParam } = detectPaginationParams(queryParams);

    let cleanUrlKey = url;
    try {
      const parsedUrl = new URL(url);
      if (pageParam) parsedUrl.searchParams.delete(pageParam);
      cleanUrlKey = `${parsedUrl.origin}${parsedUrl.pathname}`;
    } catch (e) {}

    const reqData: InterceptedApiRequest = {
      id: `req-${details.tabId}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      url: details.url,
      method: details.method || 'GET',
      tabId: details.tabId,
      headers: headers,
      queryParams: queryParams,
      timestamp: Date.now(),
      detectedPageParam: pageParam || 'page',
      detectedLimitParam: limitParam || 'limit'
    };

    if (!tabRequestsMap.has(details.tabId)) {
      tabRequestsMap.set(details.tabId, new Map());
    }
    
    tabRequestsMap.get(details.tabId)!.set(cleanUrlKey, reqData);

    chrome.runtime.sendMessage({
      action: 'API_REQUEST_LOGGED',
      request: reqData
    }).catch(() => {});
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders', 'extraHeaders']
);

chrome.tabs.onRemoved.addListener((tabId) => {
  tabRequestsMap.delete(tabId);
});

// JSON to CSV Converter Helper: Flatten nested JSON objects
function flattenJsonObject(obj: any, prefix = ''): Record<string, any> {
  const flattened: Record<string, any> = {};

  if (obj === null || obj === undefined) return { value: '' };
  if (typeof obj !== 'object') return { value: String(obj) };

  for (const key of Object.keys(obj)) {
    const propName = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];

    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(flattened, flattenJsonObject(val, propName));
    } else if (Array.isArray(val)) {
      flattened[propName] = JSON.stringify(val);
    } else {
      flattened[propName] = val ?? '';
    }
  }

  return flattened;
}

// Discover all JSON Array paths in a JSON response
function discoverArrayPaths(data: any, currentPath = ''): { path: string; length: number }[] {
  const paths: { path: string; length: number }[] = [];

  if (Array.isArray(data)) {
    paths.push({ path: currentPath || 'root', length: data.length });
  } else if (data && typeof data === 'object') {
    for (const key of Object.keys(data)) {
      const propPath = currentPath ? `${currentPath}.${key}` : key;
      const val = data[key];
      if (Array.isArray(val)) {
        paths.push({ path: propPath, length: val.length });
      } else if (val && typeof val === 'object') {
        paths.push(...discoverArrayPaths(val, propPath));
      }
    }
  }

  return paths;
}

// Extract value by dot-notation JSON path string
function getValueByPath(obj: any, pathStr: string): any {
  if (!pathStr || pathStr === 'root') {
    return Array.isArray(obj) ? obj : [obj];
  }

  const parts = pathStr.split('.');
  let curr = obj;
  for (const p of parts) {
    if (curr && typeof curr === 'object' && p in curr) {
      curr = curr[p];
    } else {
      return [];
    }
  }

  return Array.isArray(curr) ? curr : (curr ? [curr] : []);
}

// Smart JSON Array Extractor
function extractDataArray(data: any, targetPath?: string): any[] {
  if (!data) return [];
  
  if (targetPath) {
    const extracted = getValueByPath(data, targetPath);
    if (Array.isArray(extracted)) return extracted;
  }

  if (Array.isArray(data)) return data;

  const detectedPaths = discoverArrayPaths(data);
  if (detectedPaths.length > 0) {
    detectedPaths.sort((a, b) => b.length - a.length);
    const bestPath = detectedPaths[0].path;
    return getValueByPath(data, bestPath);
  }

  if (typeof data === 'object') {
    const lowerKeys = Object.keys(data).map(k => k.toLowerCase());
    const isPaginationMeta = (
      lowerKeys.includes('page') || 
      lowerKeys.includes('total') || 
      lowerKeys.includes('limit') || 
      lowerKeys.includes('totalpages')
    );
    if (!isPaginationMeta) {
      return [data];
    }
  }

  return [];
}

// Background Multi-Page Fetcher Engine
async function runBackgroundFetch(requestId: string, startPage: number, endPage: number, limit: number, jsonPath?: string) {
  let req: InterceptedApiRequest | undefined;
  for (const map of tabRequestsMap.values()) {
    for (const item of map.values()) {
      if (item.id === requestId) {
        req = item;
        break;
      }
    }
    if (req) break;
  }

  const targetUrlString = req ? req.url : requestId;
  const pageParamName = req?.detectedPageParam || 'page';
  const limitParamName = req?.detectedLimitParam || 'limit';

  activeJobState.status = 'fetching';
  activeJobState.error = null;
  activeJobState.progressMessage = `Starting API fetch loop (pages ${startPage}–${endPage})...`;
  saveStateToStorage();

  const masterItems: Record<string, any>[] = [];

  try {
    for (let page = startPage; page <= endPage; page++) {
      let targetUrl: URL;
      try {
        targetUrl = new URL(targetUrlString);
      } catch (e) {
        activeJobState.status = 'error';
        activeJobState.error = `Invalid URL format: ${targetUrlString}`;
        saveStateToStorage();
        return;
      }

      if (pageParamName) targetUrl.searchParams.set(pageParamName, String(page));
      if (limit > 0 && limitParamName) targetUrl.searchParams.set(limitParamName, String(limit));

      activeJobState.progressMessage = `Fetching page ${page} of ${endPage} (${masterItems.length} items loaded)...`;
      saveStateToStorage();

      const fetchOptions: RequestInit = {
        method: req?.method || 'GET',
        headers: req?.headers || {},
        credentials: 'include'
      };

      const response = await fetch(targetUrl.toString(), fetchOptions);
      if (!response.ok) {
        console.warn(`Page ${page} returned status ${response.status}`);
        continue;
      }

      const json = await response.json();
      const itemsArray = extractDataArray(json, jsonPath);

      if (itemsArray.length === 0) {
        break;
      }

      const flattenedBatch = itemsArray.map(item => flattenJsonObject(item));
      masterItems.push(...flattenedBatch);
    }

    if (masterItems.length === 0) {
      activeJobState.status = 'error';
      activeJobState.error = 'The API returned 0 records for the requested pages.';
    } else {
      activeJobState.status = 'completed';
      activeJobState.data = masterItems;
      activeJobState.progressMessage = `Completed! ${masterItems.length} records ready for CSV/Excel export.`;
    }
  } catch (err: any) {
    activeJobState.status = 'error';
    activeJobState.error = err.message || 'Failed to fetch API endpoint.';
  }

  saveStateToStorage();
}

// Listen to runtime messages from Popup UI
chrome.runtime.onMessage.addListener((message: ApiExtensionMessage, sender, sendResponse) => {
  if (message.action === 'GET_INTERCEPTED_REQUESTS') {
    const targetTabId = message.tabId;
    if (targetTabId && tabRequestsMap.has(targetTabId)) {
      const requests = Array.from(tabRequestsMap.get(targetTabId)!.values());
      sendResponse({ requests });
    } else {
      const allReqs: InterceptedApiRequest[] = [];
      tabRequestsMap.forEach(map => {
        allReqs.push(...Array.from(map.values()));
      });
      sendResponse({ requests: allReqs });
    }
  } else if (message.action === 'CLEAR_INTERCEPTED_REQUESTS') {
    if (message.tabId) {
      tabRequestsMap.delete(message.tabId);
    } else {
      tabRequestsMap.clear();
    }
    sendResponse({ success: true });
  } else if (message.action === 'GET_ACTIVE_JOB_STATE') {
    sendResponse({ state: activeJobState });
  } else if (message.action === 'SAVE_POPUP_STATE') {
    activeJobState = { ...activeJobState, ...message.state };
    saveStateToStorage();
    sendResponse({ success: true });
  } else if (message.action === 'EXECUTE_MULTI_PAGE_FETCH') {
    const { requestId, startPage, endPage, limit, jsonPath } = message;
    
    // Save popup settings to state
    activeJobState.selectedReqId = requestId;
    activeJobState.startPage = startPage;
    activeJobState.endPage = endPage;
    activeJobState.itemsPerPage = limit;
    if (jsonPath !== undefined) activeJobState.jsonPath = jsonPath;

    // Trigger background fetch loop (runs independent of popup window!)
    runBackgroundFetch(requestId, startPage, endPage, limit, jsonPath).then(() => {
      sendResponse({ state: activeJobState });
    });

    return true; // Keep message channel open for async response
  }

  return true;
});
