import React from 'react'
import { browser, Storage } from 'webextension-polyfill-ts'

import { StatefulUIElement } from 'src/util/ui-logic'
import Logic, { State, Event } from './logic'
import OnboardingBox from '../../components/onboarding-box'
import OnboardingStep from '../../components/onboarding-step'
import SettingsCheckbox from '../../components/settings-checkbox'
import SearchSettings from '../../components/search-settings'
import { STORAGE_KEYS } from 'src/options/settings/constants'
import { SIDEBAR_STORAGE_NAME } from 'src/sidebar-overlay/constants'
import {
    TRACKING_STORAGE_NAME,
    TOOLTIP_STORAGE_NAME,
} from 'src/in-page-ui/tooltip/constants'
import { OPTIONS_URL, OVERVIEW_URL } from 'src/constants'
import { PrimaryAction } from 'src/common-ui/components/design-library/actions/PrimaryAction'
import { SecondaryAction } from 'src/common-ui/components/design-library/actions/SecondaryAction'
import { OnboardingAction } from 'src/common-ui/components/design-library/actions/OnboardingAction'
import {
    KEYBOARDSHORTCUTS_STORAGE_NAME,
    KEYBOARDSHORTCUTS_DEFAULT_STATE,
} from 'src/in-page-ui/keyboard-shortcuts/constants'
import { SignInScreen } from 'src/authentication/components/SignIn'

import Margin from 'src/dashboard-refactor/components/Margin'
import styled from 'styled-components'

const ButtonBar = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
`

const styles = require('../../components/onboarding-box.css')

export interface Props {
    startOnLoginStep?: boolean
    storage: Storage.LocalStorageArea
    navToOverview: () => void
}

export default class OnboardingScreen extends StatefulUIElement<
    Props,
    State,
    Event
> {
    static TOTAL_STEPS = 7
    static defaultProps: Pick<Props, 'navToOverview' | 'storage'> = {
        storage: browser.storage.local,
        navToOverview: () => {
            window.location.href = OVERVIEW_URL
            window.location.reload()
        },
    }

    constructor(props: Props) {
        super(props, new Logic())
    }

    private get os(): 'Win' | 'Mac' {
        if (navigator.platform.startsWith('Mac')) {
            return 'Mac'
        }

        return 'Win'
    }

    componentDidMount() {
        if (this.props.startOnLoginStep) {
            this.processEvent('setStep', { step: -1 })
        }

        this.hydrateStateFromStorage()
    }

    private async hydrateStateFromStorage() {
        const storedVals = await this.props.storage.get([
            ...Object.values(STORAGE_KEYS),
            SIDEBAR_STORAGE_NAME,
            TOOLTIP_STORAGE_NAME,
            KEYBOARDSHORTCUTS_STORAGE_NAME,
        ])

        // Set default vaslues if nothing present in storage
        const defs = this.logic.getInitialState()
        const grabVal = async (key: string, defVal: any) => {
            let enabled: boolean

            if (storedVals[key] == null) {
                enabled = defVal
                await this.props.storage.set({ [key]: enabled })
            } else {
                enabled = storedVals[key]
            }

            return { enabled }
        }

        this.processEvent(
            'setAnnotationsEnabled',
            await grabVal(STORAGE_KEYS.LINKS, defs.areAnnotationsEnabled),
        )
        this.processEvent(
            'setBookmarksEnabled',
            await grabVal(STORAGE_KEYS.BOOKMARKS, defs.areBookmarksEnabled),
        )
        this.processEvent(
            'setVisitsEnabled',
            await grabVal(STORAGE_KEYS.VISITS, defs.areVisitsEnabled),
        )
        this.processEvent(
            'setScreenshotsEnabled',
            await grabVal(STORAGE_KEYS.SCREENSHOTS, defs.areScreenshotsEnabled),
        )
        this.processEvent(
            'setStubsEnabled',
            await grabVal(STORAGE_KEYS.STUBS, defs.areStubsEnabled),
        )
        this.processEvent('setVisitDelay', {
            delay: (await grabVal(STORAGE_KEYS.VISIT_DELAY, defs.visitDelay))
                .enabled as any,
        })
        this.processEvent(
            'setTooltipEnabled',
            await grabVal(TOOLTIP_STORAGE_NAME, defs.isTooltipEnabled),
        )
        this.processEvent(
            'setTrackingEnabled',
            await grabVal(TRACKING_STORAGE_NAME, defs.isTrackingEnabled),
        )
        this.processEvent(
            'setSidebarEnabled',
            await grabVal(SIDEBAR_STORAGE_NAME, defs.isSidebarEnabled),
        )

        // Keyboard shortcut state is nested
        let shortcutsEnabled = storedVals[KEYBOARDSHORTCUTS_STORAGE_NAME]
        shortcutsEnabled =
            shortcutsEnabled != null
                ? shortcutsEnabled.shortcutsEnabled
                : defs.areShortcutsEnabled

        this.processEvent('setShortcutsEnabled', { enabled: shortcutsEnabled })
    }

    private areAllSettingsChecked() {
        return (
            this.state.areVisitsEnabled &&
            this.state.areBookmarksEnabled &&
            this.state.areAnnotationsEnabled
        )
    }

    private searchImage = () => (
        <img src={'/img/searchIntro.svg'} className={styles.searchGif} />
    )
    private annotationImage = () => (
        <img
            src={'/img/annotationIllustration.svg'}
            className={styles.annotationGif}
        />
    )
    private keyboardImage = () => (
        <img
            src={'/img/shortcutsIllustration.svg'}
            className={styles.keyboardGif}
        />
    )
    private sidebarImage = () => (
        <img
            src={'/img/sidebarIllustration.svg'}
            className={styles.sidebarGif}
        />
    )
    private mobileImg = () => (
        <img src={'/img/mobileIllustration.svg'} className={styles.mobileImg} />
    )

    private shareImg = () => (
        <img src={'/img/shareIllustration.svg'} className={styles.searchGif} />
    )

    private backupImg = () => (
        <img src={'/img/backup-providers.svg'} className={styles.backupImg} />
    )

    private dataImg = () => (
        <img
            src={'/img/privacyIllustration.png'}
            className={styles.privacyImg}
        />
    )

    private logoImage = () => (
        <img src={'/img/memexLogo.svg'} className={styles.logoImg} />
    )

    private privacyImg = () => (
        <img src={'/img/privacy.svg'} className={styles.privacyImg} />
    )

    private handleTrackingToggle = () => {
        const enabled = !this.state.isTrackingEnabled
        this.processEvent('setTrackingEnabled', { enabled })
        return this.props.storage.set({ [TRACKING_STORAGE_NAME]: enabled })
    }

    private handleTooltipToggle = () => {
        const enabled = !this.state.isTooltipEnabled
        this.processEvent('setTooltipEnabled', { enabled })
        return this.props.storage.set({ [TOOLTIP_STORAGE_NAME]: enabled })
    }

    private handleSidebarToggle = () => {
        const enabled = !this.state.isSidebarEnabled
        this.processEvent('setSidebarEnabled', { enabled })
        return this.props.storage.set({ [SIDEBAR_STORAGE_NAME]: enabled })
    }

    private handleShortcutsToggle = () => {
        const enabled = !this.state.areShortcutsEnabled
        this.processEvent('setShortcutsEnabled', { enabled })

        return this.props.storage.set({
            [KEYBOARDSHORTCUTS_STORAGE_NAME]: {
                ...KEYBOARDSHORTCUTS_DEFAULT_STATE,
                shortcutsEnabled: enabled,
            },
        })
    }

    private handleNextStepClick = () => {
        this.processEvent('setStep', { step: this.state.currentStep + 1 })
    }

    private handleStepClick = (step: number) => () => {
        this.processEvent('setStep', { step })
    }

    private handleShowSearchSettingsToggle = () => {
        const shown = !this.state.showSearchSettings
        this.processEvent('setSearchSettingsShown', { shown })
    }

    private handleAllSettingsToggle = () => {
        const enabled = !this.areAllSettingsChecked()
        this.processEvent('setAnnotationsEnabled', { enabled })
        this.processEvent('setVisitsEnabled', { enabled })
        this.processEvent('setBookmarksEnabled', { enabled })

        return this.props.storage.set({
            [STORAGE_KEYS.LINKS]: enabled,
            [STORAGE_KEYS.VISITS]: enabled,
            [STORAGE_KEYS.BOOKMARKS]: enabled,
        })
    }

    private handleVisitDelayChange = (
        e: React.SyntheticEvent<HTMLInputElement>,
    ) => {
        const el = e.target as HTMLInputElement
        const delay = +el.value

        this.processEvent('setVisitDelay', { delay })
        this.props.storage.set({ [STORAGE_KEYS.VISIT_DELAY]: delay })
    }

    private renderSearchSettings() {
        return (
            <SearchSettings
                visitDelay={this.state.visitDelay}
                stubs={this.state.areStubsEnabled}
                visits={this.state.areVisitsEnabled}
                bookmarks={this.state.areBookmarksEnabled}
                annotations={this.state.areAnnotationsEnabled}
                screenshots={this.state.areScreenshotsEnabled}
                toggleAll={this.handleAllSettingsToggle}
                setVisitDelayChange={this.handleVisitDelayChange}
                showSearchSettings={this.state.showSearchSettings}
                toggleShowSearchSettings={this.handleShowSearchSettingsToggle}
                areAllSettingsChecked={this.areAllSettingsChecked()}
                toggleAnnotations={() => {
                    const enabled = !this.state.areAnnotationsEnabled
                    this.processEvent('setAnnotationsEnabled', { enabled })
                    return this.props.storage.set({
                        [STORAGE_KEYS.LINKS]: enabled,
                    })
                }}
                toggleStubs={() => {
                    const enabled = !this.state.areStubsEnabled
                    this.processEvent('setStubsEnabled', { enabled })
                    return this.props.storage.set({
                        [STORAGE_KEYS.STUBS]: enabled,
                    })
                }}
                toggleVisits={() => {
                    const enabled = !this.state.areVisitsEnabled
                    this.processEvent('setVisitsEnabled', { enabled })
                    return this.props.storage.set({
                        [STORAGE_KEYS.VISITS]: enabled,
                    })
                }}
                toggleBookmarks={() => {
                    const enabled = !this.state.areBookmarksEnabled
                    this.processEvent('setBookmarksEnabled', { enabled })
                    return this.props.storage.set({
                        [STORAGE_KEYS.BOOKMARKS]: enabled,
                    })
                }}
                toggleScreenshots={() => {
                    const enabled = !this.state.areScreenshotsEnabled
                    this.processEvent('setScreenshotsEnabled', { enabled })
                    return this.props.storage.set({
                        [STORAGE_KEYS.SCREENSHOTS]: enabled,
                    })
                }}
            />
        )
    }
    private goToMainStep = () => this.processEvent('setStep', { step: 0 })

    private renderLoginStep() {
        return (
            <div className={styles.welcomeScreen}>
                <div className={styles.welcomeText}>Welcome to Memex</div>
                <SignInScreen onSuccess={this.goToMainStep} />
                <button className={styles.skipBtn} onClick={this.goToMainStep}>
                    Skip
                </button>
            </div>
        )
    }

    private renderMainStep() {
        return (
            <div className={styles.welcomeScreen}>
                <img src={'/img/onlyIconLogo.svg'} className={styles.logoImg} />
                <div className={styles.titleText}>
                    All you need to know to get started
                </div>
                <div className={styles.shortcutContainer}>
                    <div className={styles.shortcutBox}>
                        <div className={styles.shortcutDescription}>
                            Save current page
                        </div>
                        <div className={styles.shortcutName}>
                            <span className={styles.keyboardButton}>
                                {this.os === 'Win' ? (
                                    'alt'
                                ) : (
                                    <>
                                        option
                                        <img
                                            className={styles.macOptionIcon}
                                            src="./img/macOptionDark.svg"
                                        />
                                    </>
                                )}
                            </span>
                            +<span className={styles.keyboardButton}>s</span>
                        </div>
                    </div>

                    <div className={styles.shortcutBox}>
                        <div className={styles.shortcutDescription}>
                            Annotate highlighted text
                        </div>
                        <div className={styles.shortcutName}>
                            <span className={styles.keyboardButton}>
                                {this.os === 'Win' ? (
                                    'alt'
                                ) : (
                                    <>
                                        option
                                        <img
                                            className={styles.macOptionIcon}
                                            src={'./img/macOptionDark.svg'}
                                        />
                                    </>
                                )}
                            </span>
                            +<span className={styles.keyboardButton}>a</span>
                        </div>
                    </div>

                    <div className={styles.shortcutBox}>
                        <div className={styles.shortcutDescription}>
                            Search Saved Pages & Notes
                        </div>
                        <div className={styles.shortcutName}>
                            <span className={styles.keyboardButton}>
                                {this.os === 'Win' ? (
                                    'alt'
                                ) : (
                                    <>
                                        option
                                        <img
                                            className={styles.macOptionIcon}
                                            src={'./img/macOptionDark.svg'}
                                        />
                                    </>
                                )}
                            </span>
                            +<span className={styles.keyboardButton}>f</span>
                        </div>
                    </div>
                </div>
                <div className={styles.videoBox}>

                    <iframe width="560" height="315" src="https://www.youtube.com/embed/G8UF8lQnAKA" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>

                </div> 

                {/*<div className={styles.shortcutContainer}>
                </div>


                <div className={styles.shortcutContainer}>
                    <div className={styles.shortcutDescriptionBox}>
                        <div className={styles.shortcutDescription}>
                            Save current page
                        </div>
                        <div className={styles.shortcutDescription}>
                            Annotate highlighted text
                        </div>
                        <div className={styles.shortcutDescription}>
                            Full-Text search pages and highlights
                        </div>
                    </div>
                    <div className={styles.shortcutNameBox}>
                        <div className={styles.shortcutName}>
                            alt+s
                        </div>
                        <div className={styles.shortcutName}>
                            alt+a
                        </div>
                        <div className={styles.shortcutName}>
                            alt+d
                        </div>
                    </div>
                </div>*/}
                <ButtonBar>
                    <PrimaryAction
                        label={'Try it out'}
                        onClick={() =>
                            window.open('https://worldbrain.io/actionTutorial')
                        }
                    />
                    <Margin horizontal="5px" />
                    <SecondaryAction
                        label={'Go to Dashboard'}
                        onClick={this.props.navToOverview}
                    />
                </ButtonBar>
            </div>
        )
    }

    private renderCurrentStep() {
        switch (this.state.currentStep) {
            default:
            case -1:
                return this.renderLoginStep()
            case 0:
                return this.renderMainStep()
            case 1:
                return (
                    <OnboardingStep
                        goToStep={this.handleStepClick}
                        titleText="Flexibly & quickly organise websites"
                        subtitleText="Tag, bookmark and add pages to collections."
                        renderButton={() => (
                            <OnboardingAction
                                onClick={this.handleNextStepClick}
                                label={'Next'}
                            />
                        )}
                        renderImage={this.sidebarImage}
                        totalSteps={OnboardingScreen.TOTAL_STEPS}
                        currentStep={this.state.currentStep - 1}
                        navToOverview={this.props.navToOverview}
                    >
                        <SecondaryAction
                            onClick={() =>
                                window.open(
                                    `https://worldbrain.io/tutorials/organise`,
                                )
                            }
                            label={'View Tutorials'}
                        />
                    </OnboardingStep>
                )
            case 2:
                return (
                    <OnboardingStep
                        goToStep={this.handleStepClick}
                        titleText="Make highlights & notes"
                        subtitleText="Highlight and annotate websites. Right-click on selected text or use keyboard shortcuts."
                        renderButton={() => (
                            <OnboardingAction
                                onClick={this.handleNextStepClick}
                                label={'Next'}
                            />
                        )}
                        renderImage={this.annotationImage}
                        totalSteps={OnboardingScreen.TOTAL_STEPS}
                        currentStep={this.state.currentStep - 1}
                        navToOverview={this.props.navToOverview}
                    >
                        <SecondaryAction
                            onClick={() =>
                                window.open(
                                    `https://worldbrain.io/tutorials/highlights`,
                                )
                            }
                            label={'View Tutorials'}
                        />
                    </OnboardingStep>
                )
            case 3:
                return (
                    <OnboardingStep
                        goToStep={this.handleStepClick}
                        titleText="Instantly find saved websites & notes"
                        subtitleText="Full-Text search every website you've bookmarked, tagged or annotated."
                        renderButton={() => (
                            <OnboardingAction
                                onClick={this.handleNextStepClick}
                                label={'Next'}
                            />
                        )}
                        renderImage={() => {
                            if (!this.state.showSearchSettings) {
                                return this.searchImage()
                            }
                        }}
                        totalSteps={OnboardingScreen.TOTAL_STEPS}
                        currentStep={this.state.currentStep - 1}
                        navToOverview={this.props.navToOverview}
                    >
                        <SecondaryAction
                            onClick={() =>
                                window.open(
                                    `https://worldbrain.io/tutorials/search`,
                                )
                            }
                            label={'View Tutorials'}
                        />
                    </OnboardingStep>
                )
            case 4:
                return (
                    <OnboardingStep
                        goToStep={this.handleStepClick}
                        titleText="Easily share your research"
                        subtitleText="Share collections, annotated pages and links to highlights."
                        renderButton={() => (
                            <OnboardingAction
                                onClick={this.handleNextStepClick}
                                label={'Next'}
                            />
                        )}
                        renderImage={this.shareImg}
                        totalSteps={OnboardingScreen.TOTAL_STEPS}
                        currentStep={this.state.currentStep - 1}
                        navToOverview={this.props.navToOverview}
                    >
                        <SecondaryAction
                            onClick={() =>
                                window.open(
                                    `https://worldbrain.io/tutorials/share-research`,
                                )
                            }
                            label={'View Tutorials'}
                        />
                    </OnboardingStep>
                )
            case 5:
                return (
                    <OnboardingStep
                        goToStep={this.handleStepClick}
                        titleText="Save and annotate websites on the go"
                        subtitleText="Install Memex Go for iOS and Android"
                        navToOverview={this.props.navToOverview}
                        renderButton={() => (
                            <OnboardingAction
                                onClick={this.handleNextStepClick}
                                label={'Next'}
                            />
                        )}
                        renderImage={this.mobileImg}
                        totalSteps={OnboardingScreen.TOTAL_STEPS}
                        currentStep={this.state.currentStep - 1}
                    >
                        <SecondaryAction
                            onClick={() => window.open(`${OPTIONS_URL}#/sync`)}
                            label={'Setup Sync'}
                        />
                    </OnboardingStep>
                )
            case 6:
                return (
                    <OnboardingStep
                        goToStep={this.handleStepClick}
                        titleText="Your data & attention is yours"
                        subtitleText="All data is stored offline-first and synced with End2End encryption."
                        subtitleText2="Memex is also funded without Venture Capital investments."
                        navToOverview={this.props.navToOverview}
                        renderButton={() => (
                            <OnboardingAction
                                onClick={this.handleNextStepClick}
                                label={'Next'}
                            />
                        )}
                        renderImage={this.dataImg}
                        totalSteps={OnboardingScreen.TOTAL_STEPS}
                        currentStep={this.state.currentStep - 1}
                    >
                        <SecondaryAction
                            onClick={() =>
                                window.open(
                                    `https://community.worldbrain.io/t/why-worldbrain-io-does-not-take-venture-capital/75`,
                                )
                            }
                            label={'Learn More'}
                        />
                    </OnboardingStep>
                )
            case 7:
                return (
                    <OnboardingStep
                        privacyStep
                        goToStep={this.handleStepClick}
                        titleText="Adjust your privacy settings"
                        subtitleText="Memex only shares error logs & anonymous usage statistics."
                        subtitleText2="It never sends content you save or search for."
                        renderButton={() => (
                            <OnboardingAction
                                onClick={this.props.navToOverview}
                                label={'All done! Go to dashboard'}
                            />
                        )}
                        renderImage={this.privacyImg}
                        totalSteps={OnboardingScreen.TOTAL_STEPS}
                        currentStep={this.state.currentStep - 1}
                        navToOverview={this.props.navToOverview}
                    >
                        <SecondaryAction
                            onClick={() =>
                                window.open(`https://worldbrain.io/privacy`)
                            }
                            label={'See full privacy statement'}
                        />
                        <div className={styles.settingsBox}>
                            <SettingsCheckbox
                                id="onboarding-privacy-toggle"
                                isChecked={this.state.isTrackingEnabled}
                                handleChange={this.handleTrackingToggle}
                            >
                                Share anonymous usage statistics and error logs
                            </SettingsCheckbox>
                        </div>
                    </OnboardingStep>
                )
        }
    }

    render() {
        return (
            <OnboardingBox {...this.props}>
                {this.renderCurrentStep()}
            </OnboardingBox>
        )
    }
}
