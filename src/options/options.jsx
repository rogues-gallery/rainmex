import 'core-js'
import React from 'react'
import ReactDOM from 'react-dom'
import { Provider } from 'react-redux'
import { ThemeProvider } from 'styled-components'

import { ErrorBoundary, RuntimeError } from 'src/common-ui/components'
import { theme } from 'src/common-ui/components/design-library/theme'
import configureStore from './store'
import Router from './router'
import routes from './routes'
import { ModalsContainer } from '../overview/modals/components/ModalsContainer'
import { AuthContextProvider } from 'src/authentication/components/AuthContextProvider'
import { setupRpcConnection } from 'src/util/webextensionRPC'

// Include development tools if we are not building for production
const ReduxDevTools = undefined
// process.env.NODE_ENV !== 'production'
//     ? require('src/dev/redux-devtools-component').default
//     : undefined

setupRpcConnection({ sideName: 'extension-page-options', role: 'content' })

const store = configureStore({ ReduxDevTools })

window.store = store

ReactDOM.render(
    <Provider store={store}>
        <ThemeProvider theme={theme}>
            <ErrorBoundary component={RuntimeError}>
                <AuthContextProvider>
                    <Router routes={routes} />
                    {ReduxDevTools && <ReduxDevTools />}
                    <ModalsContainer />
                </AuthContextProvider>
            </ErrorBoundary>
        </ThemeProvider>
    </Provider>,
    document.getElementById('app'),
)
