import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { competencyInsightsHandler } from './server/competencyInsightsHandler.js'

function competencyInsightsApi() {
  return {
    name: 'competency-insights-api',
    configureServer(server) {
      server.middlewares.use('/api/ai/competency-insights', (request, response, next) => {
        if (request.method !== 'POST') {
          next()
          return
        }
        competencyInsightsHandler(request, response).catch((error) => {
          console.error('[competency-insights]', error)
          if (!response.headersSent) {
            response.statusCode = 500
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ error: 'AI insights are temporarily unavailable.' }))
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return {
    plugins: [react(), competencyInsightsApi()],
  }
})