import React, { PureComponent } from 'react'
import styled, { css } from 'styled-components'

import colors from 'src/dashboard-refactor/colors'
import { sizeConstants } from 'src/dashboard-refactor/constants'
import styles, { fonts } from 'src/dashboard-refactor/styles'
import TagPicker from 'src/tags/ui/TagPicker'
import Margin from 'src/dashboard-refactor/components/Margin'
import DomainPicker from './DomainPicker/'
import DatePicker, {
    DateRangeSelectionProps,
} from 'src/overview/search-bar/components/DateRangeSelection'
import { SearchFilterLabel, SearchFilterType } from '../types'
import { DomainPickerDependencies } from './DomainPicker/logic'
import { TagPickerDependencies } from 'src/tags/ui/TagPicker/logic'
import { HoverBox } from 'src/common-ui/components/design-library/HoverBox'

const windowWidth: number = window.innerWidth
const searchBarWidthPx: number = sizeConstants.searchBar.widthPx

const Container = styled.div<{ hidden: boolean }>`
    height: 30px;
    width: 100%;
    border-bottom: 1px solid ${(props) => props.theme.colors.lightgrey};
    justify-content: center;
    position: sticky;
    top: 45px;
    background: white;
    z-index: 1;
    border-top: 1px solid ${(props) => props.theme.colors.lightgrey};

    ${(props) =>
        css`
            display: ${props.hidden ? 'none' : 'flex'};
        `};
`

const FilterBtnsContainer = styled.div`
    width: ${searchBarWidthPx}px;
    position: relative;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: flex-end;
`

const PickersContainer = styled.div`
    position: relative;
    top: 30px;
`


const FilterSelectButton = styled.div<{ filterActive: boolean }>`
    width: min-content;
    display: flex;
    align-items: center;
    padding: 3px 6px;

    ${(props) => css`
        background-color: ${props.filterActive
            ? props.theme.colors.purple
            : 'white'};
        color: ${props.filterActive ? 'white' : props.theme.colors.primary};
        border: 1px solid
            ${props.filterActive ? props.theme.colors.purple : 'lightGrey'};
    `}
    border-radius: ${styles.borderRadius.medium};
    cursor: pointer;
`

const TextSpan = styled.span`
    font-family: ${fonts.primary.name};
    font-weight: ${fonts.primary.weight.normal};
    font-size: 12px;
    line-height: 15px;
`

export interface FiltersBarProps {
    isDisplayed: boolean
    showTagsFilter: boolean
    showDatesFilter: boolean
    areTagsFiltered: boolean
    areDatesFiltered: boolean
    showDomainsFilter: boolean
    areDomainsFiltered: boolean
    toggleTagsFilter: () => void
    toggleDatesFilter: () => void
    toggleDomainsFilter: () => void
    tagPickerProps: TagPickerDependencies
    datePickerProps: DateRangeSelectionProps
    domainPickerProps: DomainPickerDependencies
}

export default class FiltersBar extends PureComponent<FiltersBarProps> {
    private renderFilterSelectButton = (
        label: SearchFilterLabel,
        name: SearchFilterType,
        onToggle: React.MouseEventHandler,
        isShown: boolean,
        isFiltered: boolean,
    ) => (
        <Margin horizontal="7px" vertical="7px" width="auto">
            <FilterSelectButton
                selected={isShown}
                onClick={onToggle}
                className={`${name}-picker-button`}
                filterActive={isFiltered}
            >
                <Margin horizontal="7px">
                    <TextSpan>{label}</TextSpan>
                </Margin>
            </FilterSelectButton>
        </Margin>
    )

    private renderDatePicker = () => {
        if (!this.props.showDatesFilter) {
            return false
        }

        return (
            <HoverBox width="auto" top="0" right="0">
                <DatePicker
                    {...this.props.datePickerProps}
                    outsideClickIgnoreClass="date-picker-button"
                />
            </HoverBox>
        )
    }

    private renderTagPicker = () => {
        if (!this.props.showTagsFilter) {
            return false
        }

        return (
            <HoverBox top="0" right="0">
                <TagPicker
                    {...this.props.tagPickerProps}
                    searchInputPlaceholder="Add Tag Filters"
                    removeToolTipText="Remove filter"
                    outsideClickIgnoreClass="tag-picker-button"
                    filterMode
                />
            </HoverBox>
        )
    }

    private renderDomainPicker = () => {
        if (!this.props.showDomainsFilter) {
            return false
        }

        return (
            <HoverBox top="0" right="0px">
                <DomainPicker
                    {...this.props.domainPickerProps}
                    searchInputPlaceholder="Add Domain Filters"
                    removeToolTipText="Remove filter"
                    outsideClickIgnoreClass="domain-picker-button"
                />
            </HoverBox>
        )
    }

    render() {
        return (
            <>
                <Container hidden={!this.props.isDisplayed}>
                    <FilterBtnsContainer>
                        {this.renderFilterSelectButton(
                            'Date',
                            'date',
                            this.props.toggleDatesFilter,
                            this.props.showDatesFilter,
                            this.props.areDatesFiltered,
                        )}
                        {this.renderFilterSelectButton(
                            'Domains',
                            'domain',
                            this.props.toggleDomainsFilter,
                            this.props.showDomainsFilter,
                            this.props.areDomainsFiltered,
                        )}
                        {this.renderFilterSelectButton(
                            'Tags',
                            'tag',
                            this.props.toggleTagsFilter,
                            this.props.showTagsFilter,
                            this.props.areTagsFiltered,
                        )}
                    </FilterBtnsContainer>
                    <PickersContainer>
                        <Margin horizontal="7px">
                            {this.renderDatePicker()}
                            {this.renderTagPicker()}
                            {this.renderDomainPicker()}
                        </Margin>
                    </PickersContainer>
                </Container>
            </>
        )
    }
}
