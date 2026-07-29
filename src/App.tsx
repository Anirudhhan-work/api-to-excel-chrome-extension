import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  Network, 
  Download, 
  RefreshCw, 
  Check, 
  Copy, 
  FileText, 
  Database,
  Search,
  AlertCircle,
  Play,
  RotateCw,
  Globe,
  Code,
  Filter,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { InterceptedApiRequest, ActiveJobState } from './types';

export default function App() {
  const [requests, setRequests] = useState<InterceptedApiRequest[]>([]);
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);
  const [apiSearchTerm, setApiSearchTerm] = useState<string>('');
  const [customApiUrl, setCustomApiUrl] = useState<string>('');
  const [jsonPath, setJsonPath] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  
  // Background Job State
  const [jobStatus, setJobStatus] = useState<'idle' | 'fetching' | 'completed' | 'error'>('idle');
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Advanced Accordion Toggles for Compact UI Adjustment
  const [showDirectInput, setShowDirectInput] = useState<boolean>(false);
  const [showJsonPathInput, setShowJsonPathInput] = useState<boolean>(false);

  // Multi-page Auto Fetch Settings
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(5);
  const [itemsPerPage, setItemsPerPage] = useState<number>(50);
  const [fileName, setFileName] = useState<string>('json_extracted_data');
  const [sheetName, setSheetName] = useState<string>('Data');

  // Preview Dataset
  const [previewData, setPreviewData] = useState<Record<string, any>[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Restore state from background worker on mount & poll while fetching
  const restoreBackgroundState = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: 'GET_ACTIVE_JOB_STATE' }, (resp) => {
        if (resp && resp.state) {
          const st: ActiveJobState = resp.state;
          setJobStatus(st.status);
          setProgressMessage(st.progressMessage);
          setError(st.error);
          
          if (st.selectedReqId) setSelectedReqId(st.selectedReqId);
          if (st.customApiUrl) setCustomApiUrl(st.customApiUrl);
          if (st.jsonPath) setJsonPath(st.jsonPath);
          if (st.startPage) setStartPage(st.startPage);
          if (st.endPage) setEndPage(st.endPage);
          if (st.itemsPerPage) setItemsPerPage(st.itemsPerPage);
          if (st.fileName) setFileName(st.fileName);
          if (st.sheetName) setSheetName(st.sheetName);

          if (st.data && st.data.length > 0) {
            setPreviewData(st.data);
            setSelectedKeys(Object.keys(st.data[0]));
          }
        }
      });
    }
  };

  // Load intercepted API requests for active tab
  const loadRequests = () => {
    setLoading(true);

    if (typeof chrome === 'undefined' || !chrome.tabs) {
      const mockReqs: InterceptedApiRequest[] = [
        {
          id: 'req-1',
          url: 'https://api.store.com/v1/products?page=1&limit=50',
          method: 'GET',
          tabId: 1,
          headers: { Authorization: 'Bearer mock_jwt_token_xyz' },
          queryParams: { page: '1', limit: '50' },
          timestamp: Date.now(),
          detectedPageParam: 'page',
          detectedLimitParam: 'limit'
        },
        {
          id: 'req-2',
          url: 'https://api.store.com/v1/users?offset=0&limit=25',
          method: 'GET',
          tabId: 1,
          headers: { Cookie: 'session=abc' },
          queryParams: { offset: '0', limit: '25' },
          timestamp: Date.now(),
          detectedPageParam: 'offset',
          detectedLimitParam: 'limit'
        }
      ];

      setRequests(mockReqs);
      setSelectedReqId('req-1');
      setPreviewData([
        { id: 101, title: 'Wireless Ergonomic Mouse', category: 'Electronics', price: 49.99, rating: 4.8, stock: 120 },
        { id: 102, title: 'Mechanical RGB Keyboard', category: 'Electronics', price: 119.50, rating: 4.9, stock: 45 },
        { id: 103, title: 'UltraWide Curved Monitor', category: 'Displays', price: 499.00, rating: 4.7, stock: 15 }
      ]);
      setSelectedKeys(['id', 'title', 'category', 'price', 'rating', 'stock']);
      setLoading(false);
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTabId = tabs[0]?.id;
      
      chrome.runtime.sendMessage(
        { action: 'GET_INTERCEPTED_REQUESTS', tabId: activeTabId },
        (resp) => {
          if (resp && resp.requests) {
            setRequests(resp.requests);
            if (resp.requests.length > 0 && !selectedReqId) {
              setSelectedReqId(resp.requests[0].id);
            }
          }
          setLoading(false);
        }
      );
    });
  };

  const handleReloadTab = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.reload(tabs[0].id, {}, () => {
            setTimeout(loadRequests, 1500);
          });
        }
      });
    }
  };

  useEffect(() => {
    restoreBackgroundState();
    loadRequests();
  }, []);

  // Poll background job state while fetching so popup updates live even if closed/reopened!
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (jobStatus === 'fetching') {
      interval = setInterval(() => {
        restoreBackgroundState();
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [jobStatus]);

  // Filter requests based on user search term
  const filteredRequests = requests.filter(req => {
    if (!apiSearchTerm.trim()) return true;
    const term = apiSearchTerm.toLowerCase();
    return (
      req.url.toLowerCase().includes(term) ||
      req.method.toLowerCase().includes(term) ||
      (req.detectedPageParam && req.detectedPageParam.toLowerCase().includes(term))
    );
  });

  const selectedRequest = requests.find(r => r.id === selectedReqId);

  // Execute background multi-page fetch (Runs persistently in background service worker!)
  const handleExecuteMultiPageFetch = (targetIdOrUrl?: string) => {
    const activeTarget = targetIdOrUrl || selectedReqId || customApiUrl;
    if (!activeTarget) {
      setError('Please select an intercepted API request or enter a valid API URL.');
      return;
    }

    setJobStatus('fetching');
    setProgressMessage(`Starting background fetch loop...`);
    setError(null);

    if (typeof chrome === 'undefined' || !chrome.runtime) {
      setTimeout(() => {
        setJobStatus('completed');
        setProgressMessage('');
      }, 1000);
      return;
    }

    // Hand off fetch loop to background service worker so it never stops when clicking outside!
    chrome.runtime.sendMessage(
      {
        action: 'EXECUTE_MULTI_PAGE_FETCH',
        requestId: activeTarget,
        startPage,
        endPage,
        limit: itemsPerPage,
        jsonPath: jsonPath.trim()
      },
      (resp) => {
        restoreBackgroundState();
      }
    );
  };

  // Save changes to background storage
  const syncStateWithBackground = (updates: Partial<ActiveJobState>) => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: 'SAVE_POPUP_STATE', state: updates });
    }
  };

  // Toggle field keys
  const toggleKey = (key: string) => {
    if (selectedKeys.includes(key)) {
      if (selectedKeys.length > 1) {
        setSelectedKeys(selectedKeys.filter(k => k !== key));
      }
    } else {
      setSelectedKeys([...selectedKeys, key]);
    }
  };

  const getProcessedData = (): Record<string, any>[] => {
    if (previewData.length === 0) return [];

    const filteredKeys = previewData.map(row => {
      const filteredRow: Record<string, any> = {};
      selectedKeys.forEach(k => {
        filteredRow[k] = row[k] ?? '';
      });
      return filteredRow;
    });

    if (!searchTerm.trim()) return filteredKeys;
    const term = searchTerm.toLowerCase();

    return filteredKeys.filter(row =>
      Object.values(row).some(v => String(v).toLowerCase().includes(term))
    );
  };

  const processedData = getProcessedData();

  // Export handlers
  const handleExportExcel = () => {
    if (processedData.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(processedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Data');

    const finalName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
    XLSX.writeFile(wb, finalName);
  };

  const handleExportCSV = () => {
    if (processedData.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(processedData);
    const csvContent = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyToClipboard = () => {
    if (processedData.length === 0) return;
    const headers = Object.keys(processedData[0]).join('\t');
    const rows = processedData.map(row => Object.values(row).join('\t')).join('\n');
    const tsvContent = `${headers}\n${rows}`;

    navigator.clipboard.writeText(tsvContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="logo-group">
          <div className="logo-icon">
            <Network size={16} />
          </div>
          <div>
            <div className="logo-title">JSON to CSV / Excel Extractor</div>
            <div className="logo-subtitle">Persistent Background Fetcher</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="icon-btn" title="Reload Tab & Capture Network" onClick={handleReloadTab}>
            <RotateCw size={14} />
          </button>
          <button className="icon-btn" title="Refresh API List" onClick={loadRequests}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-content">
        {/* Status Card */}
        <div className="status-card">
          <div className="status-info">
            <Database size={15} style={{ color: '#6366f1' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '11px' }}>Network API Inspector</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                Persistent Background Execution
              </div>
            </div>
          </div>
          <span className="status-badge">
            {requests.length} API{requests.length !== 1 ? 's' : ''} Captured
          </span>
        </div>

        {/* Live Background Progress Banner */}
        {jobStatus === 'fetching' && (
          <div className="bg-banner">
            <RefreshCw size={14} className="animate-spin" style={{ color: '#6366f1' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '11px' }}>Background Fetching Active...</div>
              <div style={{ fontSize: '10px', opacity: 0.9 }}>{progressMessage}</div>
            </div>
          </div>
        )}

        {error && (
          <div className="empty-state">
            <AlertCircle size={26} style={{ color: '#ef4444' }} />
            <div style={{ color: '#ef4444', fontSize: '11px' }}>{error}</div>
          </div>
        )}

        {/* Collapsible Accordion Tools for Compact UI Adjustment */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button 
            className="btn-secondary" 
            style={{ flex: 1, padding: '6px 8px', fontSize: '10px' }}
            onClick={() => setShowDirectInput(!showDirectInput)}
          >
            <Globe size={13} />
            Direct API URL {showDirectInput ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
          </button>
          <button 
            className="btn-secondary" 
            style={{ flex: 1, padding: '6px 8px', fontSize: '10px' }}
            onClick={() => setShowJsonPathInput(!showJsonPathInput)}
          >
            <Code size={13} />
            JSON Path {showJsonPathInput ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
          </button>
        </div>

        {showDirectInput && (
          <div style={{ background: 'var(--bg-card)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div className="section-label">Direct API Endpoint URL</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input 
                type="text" 
                className="form-input" 
                placeholder="https://api.site.com/items" 
                style={{ flex: 1, fontSize: '11px' }}
                value={customApiUrl}
                onChange={e => {
                  setCustomApiUrl(e.target.value);
                  syncStateWithBackground({ customApiUrl: e.target.value });
                }}
              />
              <button 
                className="btn-primary" 
                style={{ flex: 'none', padding: '0 10px', fontSize: '11px' }}
                onClick={() => handleExecuteMultiPageFetch(customApiUrl)}
                disabled={jobStatus === 'fetching' || !customApiUrl.trim()}
              >
                Fetch
              </button>
            </div>
          </div>
        )}

        {showJsonPathInput && (
          <div style={{ background: 'var(--bg-card)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div className="section-label">JSON Array Path</div>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. data.items, results, rows (Blank = Auto-Detect)" 
              style={{ width: '100%', fontSize: '11px' }}
              value={jsonPath}
              onChange={e => {
                setJsonPath(e.target.value);
                syncStateWithBackground({ jsonPath: e.target.value });
              }}
            />
          </div>
        )}

        {requests.length === 0 && !loading && (
          <div className="empty-state">
            <Network size={32} style={{ color: 'var(--border-color)' }} />
            <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>No APIs intercepted yet on this tab.</div>
            <div style={{ fontSize: '10px' }}>
              Click <strong>Reload Tab</strong> (top right) to reload page and capture network traffic!
            </div>
            <button className="btn-secondary" style={{ marginTop: 4 }} onClick={handleReloadTab}>
              <RotateCw size={13} /> Reload Tab & Capture
            </button>
          </div>
        )}

        {requests.length > 0 && (
          <>
            {/* Intercepted Requests List with Search */}
            <div>
              <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Intercepted API Endpoints ({filteredRequests.length} / {requests.length})</span>
                {apiSearchTerm && (
                  <span 
                    style={{ color: '#6366f1', cursor: 'pointer', textTransform: 'none', fontSize: '10px' }}
                    onClick={() => setApiSearchTerm('')}
                  >
                    Clear Filter
                  </span>
                )}
              </div>

              {/* API Search Bar */}
              <div style={{ position: 'relative', marginBottom: 6 }}>
                <Filter size={12} style={{ position: 'absolute', left: 8, top: 8, color: '#9ca3af' }} />
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Filter API URLs (e.g. products, users, v1, GET)..." 
                  style={{ paddingLeft: 26, width: '100%', fontSize: '11px' }}
                  value={apiSearchTerm}
                  onChange={e => setApiSearchTerm(e.target.value)}
                />
              </div>

              {/* Filtered Request List */}
              <div className="req-list">
                {filteredRequests.length === 0 ? (
                  <div style={{ padding: '10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', background: 'var(--bg-card)', borderRadius: '6px' }}>
                    No API endpoints match "{apiSearchTerm}".
                  </div>
                ) : (
                  filteredRequests.map(req => (
                    <div
                      key={req.id}
                      className={`req-card ${req.id === selectedReqId ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedReqId(req.id);
                        syncStateWithBackground({ selectedReqId: req.id });
                      }}
                    >
                      <div className="req-url-text">{req.url}</div>
                      <div className="req-meta-row">
                        <span className="tag-method">{req.method}</span>
                        <span>Page Param: <strong>{req.detectedPageParam || 'page'}</strong></span>
                        <span>Headers: {Object.keys(req.headers).length}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pagination Settings */}
            {selectedRequest && (
              <div style={{ background: 'var(--bg-card)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <div className="section-label" style={{ marginBottom: 6 }}>Auto-Pagination Settings</div>
                <div className="config-grid">
                  <div className="form-field">
                    <label className="field-label">Start Page</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={startPage} 
                      onChange={e => {
                        const val = Number(e.target.value);
                        setStartPage(val);
                        syncStateWithBackground({ startPage: val });
                      }} 
                    />
                  </div>
                  <div className="form-field">
                    <label className="field-label">End Page</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={endPage} 
                      onChange={e => {
                        const val = Number(e.target.value);
                        setEndPage(val);
                        syncStateWithBackground({ endPage: val });
                      }} 
                    />
                  </div>
                  <div className="form-field">
                    <label className="field-label">Items / Page</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={itemsPerPage} 
                      onChange={e => {
                        const val = Number(e.target.value);
                        setItemsPerPage(val);
                        syncStateWithBackground({ itemsPerPage: val });
                      }} 
                    />
                  </div>
                </div>

                <button 
                  className="btn-primary" 
                  style={{ width: '100%', marginTop: '8px' }}
                  onClick={() => handleExecuteMultiPageFetch(selectedReqId!)}
                  disabled={jobStatus === 'fetching'}
                >
                  <Play size={13} className={jobStatus === 'fetching' ? 'animate-spin' : ''} />
                  {jobStatus === 'fetching' ? 'Fetching in Background...' : `Convert JSON to CSV / Excel (Pages ${startPage}–${endPage})`}
                </button>
              </div>
            )}

            {/* Keys/Field Selector */}
            {previewData.length > 0 && (
              <div>
                <div className="section-label">Extracted CSV Columns ({selectedKeys.length})</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', maxHeight: 50, overflowY: 'auto' }}>
                  {Object.keys(previewData[0]).map(key => (
                    <button
                      key={key}
                      onClick={() => toggleKey(key)}
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        border: '1px solid var(--border-color)',
                        background: selectedKeys.includes(key) ? 'var(--accent-light)' : 'var(--bg-card)',
                        color: selectedKeys.includes(key) ? 'var(--accent)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      {selectedKeys.includes(key) ? '✓ ' : ''}{key}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Filter & Controls */}
            {previewData.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={13} style={{ position: 'absolute', left: 8, top: 8, color: '#9ca3af' }} />
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Search/Filter extracted CSV rows..." 
                    style={{ paddingLeft: 26, width: '100%' }}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                <button className="btn-secondary" onClick={handleCopyToClipboard}>
                  {copied ? <Check size={13} style={{ color: '#10b981' }} /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy CSV'}
                </button>
              </div>
            )}

            {/* Data Table Preview */}
            {processedData.length > 0 && (
              <div className="preview-container">
                <div className="table-scroll">
                  <table className="preview-table">
                    <thead>
                      <tr>
                        {selectedKeys.map(k => (
                          <th key={k}>{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {processedData.slice(0, 10).map((row, rIdx) => (
                        <tr key={rIdx}>
                          {selectedKeys.map(k => (
                            <td key={k}>{String(row[k] ?? '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Export Settings */}
            {previewData.length > 0 && (
              <div className="config-grid">
                <div className="form-field" style={{ gridColumn: 'span 2' }}>
                  <label className="field-label">File Name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={fileName} 
                    onChange={e => {
                      setFileName(e.target.value);
                      syncStateWithBackground({ fileName: e.target.value });
                    }} 
                  />
                </div>
                <div className="form-field">
                  <label className="field-label">Sheet Name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={sheetName} 
                    onChange={e => {
                      setSheetName(e.target.value);
                      syncStateWithBackground({ sheetName: e.target.value });
                    }} 
                  />
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer Actions */}
      {previewData.length > 0 && (
        <footer className="app-footer">
          <button className="btn-secondary" onClick={handleExportCSV}>
            <FileText size={14} />
            Export CSV
          </button>
          <button className="btn-primary" onClick={handleExportExcel}>
            <Download size={15} />
            Export Excel (.xlsx) ({processedData.length} Rows)
          </button>
        </footer>
      )}
    </div>
  );
}
