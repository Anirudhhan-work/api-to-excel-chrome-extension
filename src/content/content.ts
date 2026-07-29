// Content Script to assist API interception in content context

// Inject inline script into web page to intercept fetch/XHR responses if needed
const script = document.createElement('script');
script.textContent = `
  (function() {
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
      const response = await origFetch.apply(this, args);
      try {
        const clone = response.clone();
        const contentType = clone.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const json = await clone.json();
          window.postMessage({ type: 'INTERCEPTED_API_RESPONSE', url: response.url, data: json }, '*');
        }
      } catch(e) {}
      return response;
    };
  })();
`;
(document.head || document.documentElement).appendChild(script);

// Relay messages to background script
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'INTERCEPTED_API_RESPONSE') {
    chrome.runtime.sendMessage({
      action: 'API_RESPONSE_CAPTURED',
      url: event.data.url,
      data: event.data.data
    }).catch(() => {});
  }
});
