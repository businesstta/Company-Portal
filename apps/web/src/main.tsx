import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false}
  static getDerivedStateFromError(){return {failed:true}}
  componentDidCatch(error:Error,info:ErrorInfo){console.error('Portal render error',error,info)}
  render(){return this.state.failed?<main style={{minHeight:'100vh',display:'grid',placeItems:'center',textAlign:'center'}}><section><h1>Something went wrong</h1><p>Please refresh the page. Your database data is safe.</p><button onClick={()=>window.location.reload()} style={{padding:'10px 16px',border:0,borderRadius:8,background:'#6554dc',color:'#fff',cursor:'pointer'}}>Refresh portal</button></section></main>:this.props.children}
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </StrictMode>,
)
