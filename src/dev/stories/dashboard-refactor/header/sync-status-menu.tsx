import React from 'react'
import { storiesOf } from '@storybook/react'

import SyncStatusMenu, {
    SyncStatusMenuProps,
} from 'src/dashboard-refactor/header/sync-status-menu'

const stories = storiesOf('Dashboard Refactor|Header/Sync Status Menu', module)

const template: SyncStatusMenuProps = {
    isDisplayed: true,
    onToggleDisplayState: () => {},
    syncState: 'enabled',
    backupState: 'enabled',
    lastSuccessfulSyncDate: new Date(),
    lastSuccessfulBackupDate: new Date(),
    showUnsyncedItemCount: false,
    isAutoBackupEnabled: false,
    unsyncedItemCount: Math.floor(Math.random() * 100),
    onToggleAutoBackup: () => {},
    onShowUnsyncedItemCount: () => {},
    onHideUnsyncedItemCount: () => {},
    onInitiateSync: () => console.log('sync initiated'),
    onInitiateBackup: () => console.log('backup initiated'),
    onClickOutside: () => {},
    goToBackupRoute: () => {},
    goToSyncRoute: () => {},
}

export const syncStatusMenuStoryProps: {
    hidden: SyncStatusMenuProps
    allEnabled: SyncStatusMenuProps
    allSuccessful: SyncStatusMenuProps
    allDisabled: SyncStatusMenuProps
    showUnsyncedItemCount: SyncStatusMenuProps
    syncRunning: SyncStatusMenuProps
    backupRunning: SyncStatusMenuProps
    syncError: SyncStatusMenuProps
    backupError: SyncStatusMenuProps
} = {
    hidden: {
        ...template,
    },
    allEnabled: template,
    allSuccessful: {
        ...template,
        syncState: 'success',
        backupState: 'success',
    },
    allDisabled: {
        ...template,
        syncState: 'disabled',
        backupState: 'disabled',
    },
    showUnsyncedItemCount: {
        ...template,
        showUnsyncedItemCount: true,
    },
    syncRunning: {
        ...template,
        syncState: 'running',
    },
    backupRunning: {
        ...template,
        backupState: 'running',
    },
    syncError: {
        ...template,
        syncState: 'error',
    },
    backupError: {
        ...template,
        backupState: 'error',
    },
}

stories.add('Sync and Backup Enabled', () => (
    <SyncStatusMenu {...syncStatusMenuStoryProps.allEnabled} />
))
stories.add('Sync and Backup Successful', () => (
    <SyncStatusMenu {...syncStatusMenuStoryProps.allSuccessful} />
))
stories.add('Sync and Backup Disabled', () => (
    <SyncStatusMenu {...syncStatusMenuStoryProps.allDisabled} />
))
stories.add('Sync Running', () => (
    <SyncStatusMenu {...syncStatusMenuStoryProps.syncRunning} />
))
stories.add('Backup Running', () => (
    <SyncStatusMenu {...syncStatusMenuStoryProps.backupRunning} />
))
stories.add('Sync Error', () => (
    <SyncStatusMenu {...syncStatusMenuStoryProps.syncError} />
))
stories.add('Backup Error', () => (
    <SyncStatusMenu {...syncStatusMenuStoryProps.backupError} />
))
