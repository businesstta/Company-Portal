import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false}
  static getDerivedStateFromError(){return {failed:true}}
  componentDidCatch(error:Error,info:ErrorInfo){console.error('Portal render error',error,info)}
  render(){return this.state.failed?<main style={{minHeight:'100vh',display:'grid',placeItems:'center',textAlign:'center'}}><section><h1>Something went wrong</h1><p>Please refresh the page. Your database data is safe.</p><button onClick={()=>window.location.reload()} style={{padding:'10px 16px',border:0,borderRadius:8,background:'#6554dc',color:'#fff',cursor:'pointer'}}>Refresh portal</button></section></main>:this.props.children}
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Portal root element was not found')
}

const root = createRoot(rootElement)

void import('./App.tsx')
  .then(({ default: App }) => {
    root.render(
      <StrictMode>
        <ErrorBoundary><App /></ErrorBoundary>
      </StrictMode>,
    )
  })
  .catch((error: unknown) => {
    console.error('Portal startup error', error)
    const message = error instanceof Error ? error.message : String(error)
    root.render(
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
        <section>
          <h1>Portal could not start</h1>
          <p>{message}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '10px 16px', border: 0, borderRadius: 8, background: '#6554dc', color: '#fff', cursor: 'pointer' }}
          >
            Refresh portal
          </button>
        </section>
      </main>,
    )
  })
