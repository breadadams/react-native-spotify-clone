'use strict'
import React, { Component} from 'react'
import {
	ScrollView
} from 'react-native'

export default class ScrollableView extends Component {
	render() {
		return (
			<ScrollView
				contentContainerStyle={{
					paddingTop: 64,
					paddingBottom: 50,
				}}
				style={[
					{
						backgroundColor: '#222222',
					},
					this.props.style
				]}
				automaticallyAdjustContentInsets={true}>

				{this.props.children}

			</ScrollView>
		)
	}
}


ScrollableView.propTypes = {
	style: React.PropTypes.oneOfType([
	    React.PropTypes.object,
	    React.PropTypes.number,
    ])
}