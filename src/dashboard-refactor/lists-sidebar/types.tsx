import { UIEvent } from 'ui-logic-core'

import { ListsSidebarSearchBarProps } from './components/search-bar'
import { ListsSidebarGroupProps } from './components/sidebar-group'
import { TaskState } from 'ui-logic-core/lib/types'

export interface SidebarLockedState {
    toggleSidebarLockedState(): void
    isSidebarLocked: boolean
}

export interface SidebarPeekState {
    setSidebarPeekState: (isPeeking: boolean) => () => void
    isSidebarPeeking: boolean
}

export interface ListData {
    id: number
    name: string
    remoteId?: string
    isOwnedList?: boolean
    wasPageDropped?: boolean
}

export interface ListGroupCommon
    extends Pick<ListsSidebarGroupProps, 'loadingState'> {
    isExpanded: boolean
    allListIds: number[]
    filteredListIds: number[]
}

export interface FollowedListGroup extends ListGroupCommon {}

export interface LocalListGroup extends ListGroupCommon {
    isAddInputShown: boolean
}

export type RootState = Pick<SidebarLockedState, 'isSidebarLocked'> &
    Pick<SidebarPeekState, 'isSidebarPeeking'> &
    Pick<ListsSidebarSearchBarProps, 'searchQuery'> & {
        listData: { [id: number]: ListData }
        followedLists: FollowedListGroup
        localLists: LocalListGroup

        inboxUnreadCount: number
        dragOverListId?: number
        editingListId?: number
        selectedListId?: number
        showMoreMenuListId?: number
        isSidebarToggleHovered?: boolean
        hasFeedActivity: boolean
        addListErrorMessage: string | null
        editListErrorMessage: string | null

        listDeleteState: TaskState
        listCreateState: TaskState
        listEditState: TaskState
        listShareLoadingState: TaskState
    }

export type Events = UIEvent<{
    setSidebarLocked: { isLocked: boolean }
    setSidebarPeeking: { isPeeking: boolean }
    setSidebarToggleHovered: { isHovered: boolean }
    setListQueryValue: { query: string }

    setAddListInputShown: { isShown: boolean }
    cancelListCreate: null
    confirmListCreate: { value: string }

    setLocalLists: { lists: ListData[] }
    setFollowedLists: { lists: ListData[] }
    setLocalListsExpanded: { isExpanded: boolean }
    setFollowedListsExpanded: { isExpanded: boolean }

    confirmListEdit: { value: string }
    cancelListEdit: null
    setDragOverListId: { listId?: number }
    setEditingListId: { listId: number }
    setSelectedListId: { listId: number }
    setShowMoreMenuListId: { listId: number }
    dropPageOnListItem: { listId: number; dataTransfer: DataTransfer }

    confirmListDelete: null
    cancelListDelete: null

    clickFeedActivityIndicator: null
}>

export type ListNameHighlightIndices = [number, number]
