import React from 'react'
import styled, { ThemeProvider } from 'styled-components'
import * as icons from 'src/common-ui/components/design-library/icons'

export interface ThemeProps {
    width?: string
    position?: string
    iconSize?: string
}

export interface Props {
    mainText: string
    mainBtnText: string
    theme?: ThemeProps
    onMainBtnClick: React.MouseEventHandler
    onCloseBtnClick: React.MouseEventHandler
}

export class NotifBanner extends React.PureComponent<Props> {
    static defaultProps: Partial<Props> = {
        theme: { width: '100%', iconSize: '24px' },
    }

    render() {
        return (
            <ThemeProvider
                theme={{
                    ...NotifBanner.defaultProps.theme,
                    ...this.props.theme,
                }}
            >
                <Banner>
                    <MainContent>
                        <MainText>{this.props.mainText}</MainText>
                        <MainBtn onClick={this.props.onMainBtnClick}>
                            {this.props.mainBtnText}
                        </MainBtn>
                    </MainContent>
                    <CloseBtn
                        onClick={this.props.onCloseBtnClick}
                        src={icons.close}
                    />
                </Banner>
            </ThemeProvider>
        )
    }
}

const Banner = styled.div`
    display: flex;
    flex-direction: row;
    background: #bed0f7;
    height: 45px;
    width: ${({ theme }) => theme.width};
    position: ${({ theme }) => theme.position};
    padding: 0 20px;
    bottom: 0px;
    z-index: 1000000;
    justify-content: center;
    align-items: center;
`

const MainContent = styled.div`
    max-width: 770px;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
`
const MainText = styled.span`
    font-size: 16px;
    font-weight: bold;
    margin-right: 30px;
`
const MainBtn = styled.button`
    width: 160px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 3px white solid;
    cursor: pointer;
    border-radius: 3px;
    background: none;
    font-size: 14px;
    outline: none;
    background: white;

    &:hover {
        opacity: 0.8;
    }
`
const CloseBtn = styled.img`
    width: ${({ theme }) => theme.iconSize};
    height: ${({ theme }) => theme.iconSize};
    padding: 4px;
    cursor: pointer;
    outline: none;
    border-radius: 3px;

    &:hover {
        background-color: #e0e0e0;
    }
`
