// tslint:disable-next-line:no-implicit-dependencies
import { ProgressInfo, UpdateInfo } from 'builder-util-runtime'
import { ipcRenderer } from 'electron'
import * as React from 'react'
import { connect } from 'react-redux'
import { BrowserRouter as Router, Redirect, Route, Switch } from 'react-router-dom'
import 'rxjs'

import ElectraJsMiddleware from '../middlewares/ElectraJs'
import { AccountChecking, AccountLegacy, AccountOverview, AccountPurse, AccountSavings } from './account'
import { AddressBook } from './addressBook'
import Toast from './common/toast/toast'
import { Header } from './header'
import Login from './login'
import { Payments } from './payments'
import Settings from './settings'
import Loader from './shared/loader'
import TitleBar from './shared/title-bar'
import { Sidebar } from './sidebar'
import { StoreState } from './types'

interface OwnState {
  isLoading: boolean
  isQuitting: boolean
  isStarting: boolean
  isUpdating: boolean
  loaderSubtext?: string
  loaderText: string
}

const ONE_SECOND = 1_000
const QUITTING_SLOW_DELAY = 3_000

class App extends React.Component<StoreState, OwnState> {
  private updateInfo: UpdateInfo

  public constructor(props: StoreState) {
    super(props)

    const isStartedAndReady =
      ElectraJsMiddleware.wallet.daemonState === 'STARTED' &&
      ElectraJsMiddleware.wallet.state === 'READY' &&
      ElectraJsMiddleware.wallet.lockState === 'STAKING'
    const isStarting = ['STARTING', 'STOPPED'].includes(ElectraJsMiddleware.wallet.daemonState)

    this.state = {
      isLoading: !isStarting && !isStartedAndReady,
      isQuitting: false,
      isStarting,
      isUpdating: false,
      loaderText: isStarting ? 'Starting Daemon...' : '',
    }
  }

  public componentDidMount(): void {
    ipcRenderer.once('ipcMain:electraJs:started', () => this.setState({
      isLoading: true,
      isStarting: false,
      loaderSubtext: undefined,
      loaderText: '',
    }))

    ipcRenderer.once('ipcMain:autoUpdater:found', this.startAutoUpdate.bind(this))
    ipcRenderer.on('ipcMain:app:quit', this.onQuit.bind(this))
  }

  private startAutoUpdate(event: any, resString: string): void {
    if (this.state.isQuitting) return
    if (this.state.isLoading) {
      setTimeout(() => this.startAutoUpdate(event, resString), ONE_SECOND)

      return
    }

    ipcRenderer.on('ipcMain:autoUpdater:progress', this.updateDownloadStatus.bind(this))
    ipcRenderer.on('ipcMain:autoUpdater:downloaded', this.installUpdate.bind(this))
    ipcRenderer.send('ipcRenderer:autoUpdater:downloadUpdate')

    this.updateInfo = JSON.parse(resString) as UpdateInfo
    this.setState({
      isLoading: false,
      isUpdating: true,
      loaderSubtext: `Please don't close the wallet.`,
      loaderText: `Downloading update ${this.updateInfo.version}...`,
    })
  }

  private updateDownloadStatus(event: any, resString: string): void {
    const progressInfo: ProgressInfo = JSON.parse(resString) as ProgressInfo
    this.setState({
      loaderSubtext: `Please don't close the wallet.`,
      loaderText: `Downloading update ${this.updateInfo.version} (${Math.round(progressInfo.percent)}%)...`,
    })
  }

  private async installUpdate(event: any, resString: string): Promise<void> {
    this.onQuit()
    await ElectraJsMiddleware.wallet.stopDaemon()
    ipcRenderer.send('ipcRenderer:autoUpdater:quitAndInstall')
  }

  private onQuit(): void {
    this.setState({
      isLoading: false,
      isQuitting: true,
      isUpdating: false,
      loaderSubtext: undefined,
      loaderText: 'Closing daemon...',
    })

    setTimeout(() => this.setState({ loaderSubtext: 'This may take a while.' }), QUITTING_SLOW_DELAY)
  }

  public render(): JSX.Element {
    const isReady: boolean =
      !this.state.isLoading &&
      !this.state.isQuitting &&
      !this.state.isStarting &&
      !this.state.isUpdating

    return (
      <Router>
        <div className='c-app-layout'>
          {this.state.isLoading && <Login onDone={(): void => this.setState({ isLoading: false })} />}
          {(this.state.isStarting || this.state.isUpdating || this.state.isQuitting) && (
            <Loader text={this.state.loaderText} subtext={this.state.loaderSubtext} />
          )}

          {isReady && [
            // We show the custom title bar on Linux & Windows to show minimize/maximize/close usual buttons.
            process.platform === 'win32' ? <TitleBar key='title-bar' /> : undefined,
            <div key='header' className='c-app-layout__toolbar'>
              <Header />
            </div>,
            <div key='container' className='c-app-layout__container'>
              <aside>
                <Sidebar />
              </aside>
              <main>
                <Switch>
                  <Route exact path='/' component={AccountOverview} />
                  <Route exact path='/purse' component={AccountPurse} />
                  <Route exact path='/checking' component={AccountChecking} />
                  <Route exact path='/savings' component={AccountSavings} />
                  <Route exact path='/legacy' component={AccountLegacy} />
                  <Route exact path='/payments' component={Payments} />
                  <Route exact path='/address_book' component={AddressBook} />
                  <Route exact path='/settings' component={Settings} />
                  <Redirect to='/' />
                </Switch>
                <Toast
                  message={this.props.toast.message}
                  badge={this.props.toast.badge}
                />
              </main>
            </div>,
          ]}
        </div>
      </Router>
    )
  }
}

export default connect<StoreState>((state: StoreState) => ({ ...state }))(App)
