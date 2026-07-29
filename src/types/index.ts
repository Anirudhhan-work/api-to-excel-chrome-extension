export interface InterceptedApiRequest {
  id: string;
  url: string;
  method: string;
  tabId: number;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  timestamp: number;
  detectedPageParam?: string;
  detectedLimitParam?: string;
  sampleItems?: Record<string, any>[];
  totalCount?: number;
}

export interface ActiveJobState {
  status: 'idle' | 'fetching' | 'completed' | 'error';
  progressMessage: string;
  data: Record<string, any>[];
  selectedReqId: string | null;
  customApiUrl: string;
  jsonPath: string;
  startPage: number;
  endPage: number;
  itemsPerPage: number;
  fileName: string;
  sheetName: string;
  error: string | null;
}

export type ApiExtensionMessage =
  | { action: 'GET_INTERCEPTED_REQUESTS'; tabId?: number }
  | { action: 'CLEAR_INTERCEPTED_REQUESTS'; tabId?: number }
  | { action: 'EXECUTE_MULTI_PAGE_FETCH'; requestId: string; startPage: number; endPage: number; limit: number; jsonPath?: string }
  | { action: 'GET_ACTIVE_JOB_STATE' }
  | { action: 'SAVE_POPUP_STATE'; state: Partial<ActiveJobState> }
  | { action: 'API_REQUEST_LOGGED'; request: InterceptedApiRequest };
