import React, { useState } from 'react';
import DephazeValidation from './DephazeValidation';
import DephazeViewer from './DephazeViewer';

function App() {
  const [tab, setTab] = useState('viewer');

  return (
    <div style={{ background: '#0f172a', minHeight: '100vh' }}>
      <nav style={{ padding: '20px', textAlign: 'center', borderBottom: '1px solid #334155' }}>
        <button 
          onClick={() => setTab('viewer')}
          style={{ margin: '0 10px', padding: '10px 20px', cursor: 'pointer', background: tab === 'viewer' ? '#8b5cf6' : '#1e293b', color: 'white', border: 'none', borderRadius: '5px' }}
        >
          3D INTERAKTÍV VIEWER
        </button>
        <button 
          onClick={() => setTab('validation')}
          style={{ margin: '0 10px', padding: '10px 20px', cursor: 'pointer', background: tab === 'validation' ? '#8b5cf6' : '#1e293b', color: 'white', border: 'none', borderRadius: '5px' }}
        >
          MATEMATIKAI VALIDÁCIÓ
        </button>
      </nav>

      <div>
        {tab === 'viewer' ? <DephazeViewer /> : <DephazeValidation />}
      </div>
    </div>
  );
}

export default App;
