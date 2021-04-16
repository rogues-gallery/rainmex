import React from 'react'
import { TaskState } from 'ui-logic-core/lib/types'

import ShareAnnotationMenu from './components/ShareAnnotationMenu'
import { executeReactStateUITask } from 'src/util/ui-logic'
import { getPageShareUrl } from 'src/content-sharing/utils'
import { ContentSharingInterface } from 'src/content-sharing/background/types'
import { AnnotationInterface } from 'src/annotations/background/types'
import { runInBackground } from 'src/util/webextensionRPC'
import { AnnotationPrivacyLevels } from 'src/annotations/types'

interface State {
    link: string
    loadState: TaskState
    shareState: TaskState
}

export interface Props {
    normalizedPageUrl: string
    closeShareMenu: React.MouseEventHandler
    copyLink: (link: string) => Promise<void>
    postShareAllHook?: () => void
    postUnshareAllHook?: () => void
    contentSharingBG?: ContentSharingInterface
    annotationsBG?: AnnotationInterface<'caller'>
}

export default class AllNotesShareMenu extends React.Component<Props, State> {
    static defaultProps: Partial<Props> = {
        contentSharingBG: runInBackground(),
        annotationsBG: runInBackground(),
    }

    private annotationUrls: string[]

    state: State = {
        link: '',
        loadState: 'pristine',
        shareState: 'pristine',
    }

    async componentDidMount() {
        await executeReactStateUITask<State, 'loadState'>(
            this,
            'loadState',
            async () => {
                await this.setRemoteLink()

                const annotations = await this.props.annotationsBG.listAnnotationsByPageUrl(
                    {
                        pageUrl: this.props.normalizedPageUrl,
                    },
                )
                this.annotationUrls = annotations.map((a) => a.url)
            },
        )
    }

    private createAnnotationPrivacyLevels = (
        privacyLevel: AnnotationPrivacyLevels,
    ) =>
        this.annotationUrls.reduce(
            (acc, annotation) => ({
                ...acc,
                [annotation]: privacyLevel,
            }),
            {},
        )

    private handleLinkCopy = () => this.props.copyLink(this.state.link)

    private setRemoteLink = async () => {
        const remotePageInfoId = await this.props.contentSharingBG.ensureRemotePageId(
            this.props.normalizedPageUrl,
        )
        this.setState({ link: getPageShareUrl({ remotePageInfoId }) })
    }

    private shareAllAnnotations = async () => {
        await this.props.contentSharingBG.shareAnnotations({
            annotationUrls: this.annotationUrls,
            queueInteraction: 'skip-queue',
        })
        await this.props.contentSharingBG.shareAnnotationsToLists({
            annotationUrls: this.annotationUrls,
            queueInteraction: 'skip-queue',
        })
        this.props.postShareAllHook?.()
    }

    private unshareAllAnnotations = async () => {
        await Promise.all(
            this.annotationUrls.map((annotationUrl) =>
                this.props.contentSharingBG
                    .unshareAnnotation({
                        annotationUrl,
                        queueInteraction: 'skip-queue',
                    })
                    .catch(),
            ),
        )
        this.props.postUnshareAllHook?.()
    }

    private handleSetShared: React.MouseEventHandler = async (e) => {
        const { annotationsBG } = this.props
        const annotationPrivacyLevels = this.createAnnotationPrivacyLevels(
            AnnotationPrivacyLevels.SHARED,
        )

        await executeReactStateUITask<State, 'shareState'>(
            this,
            'shareState',
            async () => {
                await this.shareAllAnnotations()
                await annotationsBG.updateAnnotationPrivacyLevels({
                    annotationPrivacyLevels,
                })
            },
        )
    }

    private handleSetPrivate: React.MouseEventHandler = async (e) => {
        const { annotationsBG } = this.props
        const annotationPrivacyLevels = this.createAnnotationPrivacyLevels(
            AnnotationPrivacyLevels.PRIVATE,
        )

        await executeReactStateUITask<State, 'shareState'>(
            this,
            'shareState',
            async () => {
                await this.unshareAllAnnotations()
                await annotationsBG.updateAnnotationPrivacyLevels({
                    annotationPrivacyLevels,
                })
            },
        )
    }

    render() {
        return (
            <ShareAnnotationMenu
                showLink
                link={this.state.link}
                onCopyLinkClick={this.handleLinkCopy}
                onClickOutside={this.props.closeShareMenu}
                linkTitleCopy="Link to page and shared notes"
                privacyOptionsTitleCopy="Set privacy for all notes on this page"
                isLoading={
                    this.state.shareState === 'running' ||
                    this.state.loadState === 'running'
                }
                privacyOptions={[
                    {
                        title: 'Private',
                        shortcut: 'cmd+enter',
                        description: 'Only locally available to you',
                        icon: 'person',
                        onClick: this.handleSetPrivate,
                    },
                    {
                        title: 'Shared',
                        shortcut: 'option+cmd+enter',
                        description: 'Shared in collections this page is in',
                        icon: 'shared',
                        onClick: this.handleSetShared,
                    },
                ]}
                shortcutHandlerDict={{
                    'mod+alt+enter': this.handleSetShared,
                    'mod+enter': this.handleSetPrivate,
                }}
            />
        )
    }
}
