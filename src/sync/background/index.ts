import { Browser } from 'webextension-polyfill-ts'
import StorageManager from '@worldbrain/storex'
import { SyncPostReceiveProcessor } from '@worldbrain/storex-sync'
import { SharedSyncLog } from '@worldbrain/storex-sync/lib/shared-sync-log'

import { AuthService } from '@worldbrain/memex-common/lib/authentication/types'
import SyncService, {
    SignalTransportFactory,
} from '@worldbrain/memex-common/lib/sync'
import { SYNCED_COLLECTIONS } from '@worldbrain/memex-common/lib/sync/constants'
import { TweetNaclSyncEncryption } from '@worldbrain/memex-common/lib/sync/secrets/tweetnacl'

import { PublicSyncInterface } from './types'
import {
    MemexExtClientSyncLogStorage,
    MemexExtSyncInfoStorage,
} from './storage'
import { INCREMENTAL_SYNC_FREQUENCY } from './constants'
import { filterSyncLog } from '@worldbrain/memex-common/lib/sync//sync-logging'
import { MemexExtSyncSettingStore } from './setting-store'
import { resolvablePromise } from 'src/util/promises'
import { remoteEventEmitter } from 'src/util/webextensionRPC'
import { InitialSyncEvents } from '@worldbrain/storex-sync/lib/integration/initial-sync'
import { bindMethod } from 'src/util/functions'
import { Analytics } from 'src/analytics/types'
import { captureException } from 'src/util/raven'

export default class SyncBackground extends SyncService {
    private analytics: Analytics
    remoteFunctions: PublicSyncInterface
    firstContinuousSyncPromise?: Promise<void>
    getSharedSyncLog: () => Promise<SharedSyncLog>

    readonly syncedCollections: string[] = SYNCED_COLLECTIONS
    readonly auth: AuthService

    constructor(options: {
        auth: AuthService
        storageManager: StorageManager
        signalTransportFactory: SignalTransportFactory
        getSharedSyncLog: () => Promise<SharedSyncLog>
        getIceServers?: () => Promise<string[]>
        browserAPIs: Pick<Browser, 'storage'>
        appVersion: string
        analytics: Analytics
        disableEncryption?: boolean
        postReceiveProcessor?: SyncPostReceiveProcessor
    }) {
        super({
            ...options,
            syncFrequencyInMs: INCREMENTAL_SYNC_FREQUENCY,
            clientSyncLog: new MemexExtClientSyncLogStorage({
                storageManager: options.storageManager,
            }),
            disableEncryption: options.disableEncryption,
            syncEncryption: new TweetNaclSyncEncryption({}),
            devicePlatform: 'browser',
            syncInfoStorage: new MemexExtSyncInfoStorage({
                storageManager: options.storageManager,
            }),
            settingStore: new MemexExtSyncSettingStore(options),
            productType: 'ext',
            productVersion: options.appVersion,
            postReceiveProcessor: options.postReceiveProcessor,
            continuousSyncBatchSize: 50,
        })

        this.auth = options.auth
        this.analytics = options.analytics

        this.remoteFunctions = {
            requestInitialSync: bindMethod(
                this.initialSync,
                'requestInitialSync',
            ),
            answerInitialSync: bindMethod(
                this.initialSync,
                'answerInitialSync',
            ),
            waitForInitialSync: bindMethod(this, 'waitForInitialSync'),
            waitForInitialSyncConnected: bindMethod(
                this.initialSync,
                'waitForInitialSyncConnected',
            ),
            abortInitialSync: bindMethod(this.initialSync, 'abortInitialSync'),
            enableContinuousSync: bindMethod(
                this.continuousSync,
                'enableContinuousSync',
            ),
            forceIncrementalSync: bindMethod(
                this.continuousSync,
                'forceIncrementalSync',
            ),
            listDevices: bindMethod(this.syncInfoStorage, 'listDevices'),
            removeDevice: bindMethod(this.syncInfoStorage, 'removeDevice'),
            removeAllDevices: bindMethod(
                this.syncInfoStorage,
                'removeAllDevices',
            ),
            retrieveLastSyncTimestamp: bindMethod(
                this,
                'retrieveLastSyncTimestamp',
            ),
        }

        this.initialSync.debug = true
        this.setupLastSyncTimestampStoring()
    }

    async waitForInitialSync() {
        this.analytics.trackEvent({
            category: 'Sync',
            action: 'startInitSync',
        })

        try {
            await this.initialSync.waitForInitialSync()

            this.analytics.trackEvent({
                category: 'Sync',
                action: 'finishInitSync',
            })
        } catch (err) {
            this.analytics.trackEvent({
                category: 'Sync',
                action: 'failInitSync',
            })

            throw err
        }
    }

    async createSyncLoggingMiddleware() {
        const middleware = await super.createSyncLoggingMiddleware()
        middleware.changeInfoPreprocessor = filterSyncLog
        return middleware
    }

    async setup() {
        await this.continuousSync.setup()

        const authChangePromise = resolvablePromise()
        this.auth.events.once('changed', () => {
            authChangePromise.resolve()
        })

        this.firstContinuousSyncPromise = (async () => {
            const maybeSync = async () => {
                const isAuthenticated = !!(await this.auth.getCurrentUser())
                if (isAuthenticated) {
                    await this.continuousSync.forceIncrementalSync()
                }
                return isAuthenticated
            }
            if (await maybeSync()) {
                return
            }

            await Promise.race([
                authChangePromise,
                new Promise((resolve) => setTimeout(resolve, 2000)),
            ])
            await maybeSync()
        })()
    }

    async tearDown() {
        await this.continuousSync.tearDown()
    }

    registerRemoteEmitter() {
        const remoteEmitter = remoteEventEmitter<InitialSyncEvents>('sync')

        this.initialSync.events.on('progress', (args) => {
            return remoteEmitter.emit('progress', args)
        })
        this.initialSync.events.on('roleSwitch', (args) => {
            return remoteEmitter.emit('roleSwitch', args)
        })
        this.initialSync.events.on('error', (args) => {
            captureException(`InitialSyncError - ${args.error}`)
            return remoteEmitter.emit('error', args)
        })
        this.initialSync.events.on('finished', async (args) => {
            return remoteEmitter.emit('finished', args)
        })
        this.initialSync.events.on('channelTimeout', () => {
            captureException(`InitialSyncError - channelTimeout`)
            return remoteEmitter.emit('channelTimeout', {})
        })
        this.initialSync.events.on('packageStalled', () => {
            captureException(`InitialSyncError - packageStalled`)
            return remoteEmitter.emit('packageStalled', {})
        })
    }

    private setupLastSyncTimestampStoring = () => {
        this.continuousSync.events.on('syncFinished', async (event) => {
            if (!event.error) {
                await this.storeLastSyncTimestamp()
            }
        })

        this.initialSync.events.on('finished', async (event) => {
            await this.storeLastSyncTimestamp()
        })
    }

    private storeLastSyncTimestamp = async (timestamp = Date.now()) => {
        await this.settingStore.storeSetting('lastSyncTimestamp', timestamp)
    }

    retrieveLastSyncTimestamp = async (): Promise<number> => {
        const timestamp = await this.settingStore.retrieveSetting(
            'lastSyncTimestamp',
        )

        if (!timestamp) {
            throw new Error('No last sync timestamp exists')
        }

        return timestamp as number
    }
}
