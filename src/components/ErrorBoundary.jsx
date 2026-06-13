import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ position:'fixed', inset:0, background:'#0c0b0a', color:'#e0d6ca', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px', fontFamily:'monospace', gap:'16px' }}>
          <div style={{ fontSize:'22px', fontWeight:700 }}>Flair</div>
          <div style={{ color:'#c07c10', fontSize:'13px' }}>Something went wrong</div>
          <pre style={{ background:'#181614', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', padding:'16px', fontSize:'11px', maxWidth:'700px', overflowX:'auto', color:'#78706a', whiteSpace:'pre-wrap', wordBreak:'break-all' }}>{String(this.state.error)}</pre>
          <button onClick={() => window.location.reload()} style={{ padding:'8px 20px', background:'#c07c10', color:'#0c0b0a', borderRadius:'6px', fontWeight:600, border:'none', cursor:'pointer' }}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
