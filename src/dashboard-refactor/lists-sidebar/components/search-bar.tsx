import React, { PureComponent } from 'react'
import styled, { css } from 'styled-components'

import Margin from 'src/dashboard-refactor/components/Margin'
import { Icon } from 'src/dashboard-refactor/styled-components'

import styles, { fonts } from 'src/dashboard-refactor/styles'
import colors from 'src/dashboard-refactor/colors'
import { SidebarLockedState } from '../types'

const textStyles = `
    font-family: ${fonts.primary.name};
    font-weight: ${fonts.primary.weight.normal};
    font-size: 12px;
    line-height: 15px;
    color: ${(props) => props.theme.colors.primary};
    cursor: text;
`

const OuterContainer = styled.div<{ isSidebarLocked: boolean }>`
    height: min-content;
    padding-left: 8px;
    padding-right: 8px;
    background-color: ${colors.lightGrey};
    border-radius: 3px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    width: 100%;
    margin: 5px 5px;
`

const InnerContainer = styled.div<{ displayTopBorder?: boolean }>`
    height: 30px;
    width: 100%;
    background-color: transparent;
    display: flex;
    flex-direction: row;
    justify-content: start;
    align-items: center;
    ${(props) =>
        props.displayTopBorder &&
        css`
            border-top: 0.5px solid ${colors.lighterGrey};
        `}
`

const Input = styled.input`
    ${textStyles}
    width: 100%;
    border: none;
    background: inherit;
    &::placeholder {
        opacity: 0.6;
    }

    &:focus {
        outline: none;
    }
    flex-direction: flex-start;
    margin: 0;
`

const TextSpan = styled.span<{ bold?: boolean }>`
    ${textStyles}
    ${(props) =>
        props.bold &&
        css`
            font-weight: ${styles.fonts.primary.weight.bold};
        `}
`

const IconContainer = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-items: start;
`

const StyledIcon = styled(Icon)`
    color: ${(props) => props.theme.colors.primary};
    opacity: 0.7;
    cursor: pointer;
`

export interface ListsSidebarSearchBarProps {
    hasPerfectMatch: boolean
    searchQuery?: string
    onSearchQueryChange(inputString: string): void
    onInputClear(): void
    onCreateNew(newListName: string): void // should this return a promise?
    sidebarLockedState: SidebarLockedState
}

export default class ListsSidebarSearchBar extends PureComponent<
    ListsSidebarSearchBarProps
> {
    private inputRef = React.createRef<HTMLInputElement>()

    private handleInputChange: React.ChangeEventHandler<HTMLInputElement> = (
        evt,
    ) => {
        this.props.onSearchQueryChange(evt.currentTarget.value)
    }

    private handleCreateNewClick: React.MouseEventHandler = (
        evt: React.MouseEvent,
    ) => {
        this.props.onCreateNew(this.props.searchQuery)
    }

    private renderCreateNew = () => {
        return (
            <InnerContainer
                horizontal="8px"
                displayTopBorder
                onClick={this.handleCreateNewClick}
            >
                <Margin right="8px">
                    <TextSpan>Create New:</TextSpan>
                </Margin>
                <TextSpan bold>{this.props.searchQuery}</TextSpan>
            </InnerContainer>
        )
    }

    handleClearSearch() {
        this.props.onInputClear()
        this.inputRef.current.focus()
    }

    render(): JSX.Element {
        const {
            searchQuery,
            sidebarLockedState: { isSidebarLocked },
        } = this.props
        return (
            <OuterContainer isSidebarLocked={isSidebarLocked}>
                <InnerContainer horizontal="8px">
                    {!!searchQuery ? (
                        <IconContainer>
                            <Margin right="5px">
                                <StyledIcon
                                    heightAndWidth="12px"
                                    path="/img/cross_grey.svg"
                                    onClick={() => this.handleClearSearch()}
                                />
                            </Margin>
                        </IconContainer>
                    ) : (
                        <IconContainer>
                            <Margin right="5px">
                                <Icon
                                    heightAndWidth="16px"
                                    path="/img/searchIcon.svg"
                                />
                            </Margin>
                        </IconContainer>
                    )}
                    <Input
                        placeholder="Search collections"
                        ref={this.inputRef}
                        onChange={this.handleInputChange}
                        value={searchQuery}
                    />
                </InnerContainer>
                {!!this.props.searchQuery &&
                    !this.props.hasPerfectMatch &&
                    this.renderCreateNew()}
            </OuterContainer>
        )
    }
}
