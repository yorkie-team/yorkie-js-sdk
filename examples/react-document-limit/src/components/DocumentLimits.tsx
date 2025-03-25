import React from 'react';

export default function DocumentLimits() {
  return (
    <div className="info-side">
        <h1>How to Configure Document Limits</h1>
        <p className="info-subtitle">You can configure document limitations in Project Settings of the Yorkie Dashboard. After changing settings, it may take up to 10 minutes for the changes to be applied across all servers.</p>
        
        <div className="image-container">
          <img src="/setting-image.png" alt="Yorkie Dashboard Settings" className="settings-image" />
          <p className="image-caption">Project Settings screen in Yorkie Dashboard</p>
        </div>
        
        <div className="limit-info-container">
          <h2>Setting Max Subscribers per Document</h2>
          <p>1. Access Yorkie Dashboard</p>
          <p>2. Select Project Settings menu</p>
          <p>3. Configure Max Subscribers per Document value</p>
          <div className="alert info">
            <p className="alert-text">SDK auto-retries connection (1/sec) when limit exceeded</p>
          </div>
        </div>
        
        <div className="limit-info-container">
          <h2>Setting Max Attachments per Document</h2>
          <p>1. Access Yorkie Dashboard</p>
          <p>2. Select Project Settings menu</p>
          <p>3. Configure Max Attachments per Document value</p>
          <div className="alert warning">
            <p className="alert-text">To properly clean up resources when a client terminates, add the following code:</p>
            <pre><code>{`window.addEventListener('beforeunload', () => {\n\tclient.deactivate({keepalive: true});\n});`}</code></pre>
          </div>
        </div>
      </div>
  );
}