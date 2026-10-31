import { StyleProvider } from '@ant-design/cssinjs'
import { App as AntApp, ConfigProvider } from 'antd'
import enGB from 'antd/locale/en_GB'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { antdTheme } from './brand/theme'
import { AppRoutes } from './routes'

export default function App() {
  return (
    // `layer` puts Ant Design's styles in @layer antd, so Tailwind utilities (mt-6 etc.) can override them.
    <StyleProvider layer>
    <ConfigProvider locale={enGB} theme={antdTheme}>
      <AntApp>
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
    </StyleProvider>
  )
}
