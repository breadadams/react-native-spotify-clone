'use strict'
import {
	View,
	Linking,
	AsyncStorage
} from 'react-native'

import queryString from 'query-string'

var Buffer = require('buffer/').Buffer

const CLIENT_ID = 'b8c236abd67a4bf98cb2d3ca1859e093' // Spotify app client_id
const CLIENT_SECRET = 'a3a2d358c1864351a5baaec4f691a3ac' // Spotify app client_secret
const REDIRECT_URI = 'spotifyrn:/';// Redirect URI (for auth redirect)

const STATE_KEY = 'spotify_auth_state'
const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const SCOPE = 'user-read-private playlist-read-private user-top-read user-library-read'

const SPOTIFY_API_URL = 'https://api.spotify.com/v1'
const spotifyAccountURL = 'https://accounts.spotify.com/authorize?'
const spotifyTokenURL = 'https://accounts.spotify.com/api/token'

const FETCH_LIMIT = 15 // Max items to return in get requests (amount of playlists, categories, artists, etc...)

class SpotifyWebApi {

	static headers(accessToken) {

		let headers

		if ( accessToken ) {
			headers = {
				'Authorization': 'Bearer ' + accessToken,
			}
		} else {
			headers = {
				'Accept': 'application/x-www-form-urlencoded',
				'Content-Type':'application/x-www-form-urlencoded',
				'Authorization': 'Basic ' + (new Buffer(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')),
			}
		}

		return headers
	}

	static get(url, route, accessToken) {
		return this.xhr(url, route, null, 'GET', accessToken)
	}

	static xhr(url, route, params, verb, accessToken) {
		const targetUrl = (url ? url : SPOTIFY_API_URL) + route
		let options = Object.assign(
			{ method: verb },
			params ? { body: JSON.stringify(params) } : null
		)
		options.headers = SpotifyWebApi.headers(accessToken)
		return fetch(targetUrl, options).then( resp => {
			let json = resp.json()
			if ( resp.ok ) {
				return json
			}
			return json.then(err => {throw err})
		})
	}

	static _generateRandomString(length) {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

		for (let i = 0; i < length; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}

		return text;
	}

	static authenticate(callback) {

		const keysToRemove = [
			STATE_KEY,
			ACCESS_TOKEN_KEY,
			REFRESH_TOKEN_KEY
		]

		AsyncStorage.multiRemove(keysToRemove, (err) => {

			let state = SpotifyWebApi._generateRandomString(16);

			// Set spotify_auth_state in AsyncStorage
			AsyncStorage.setItem(STATE_KEY, state, () => {
				fetch(spotifyAccountURL+
					queryString.stringify({
						response_type: 'code',
						client_id: CLIENT_ID,
						scope: SCOPE,
						redirect_uri: REDIRECT_URI,
						state: state
					})
				)
				.then((response) => {
					if ( response.ok ) {
						Linking.canOpenURL(response.url).then(supported => {
							if( supported ) {
								SpotifyWebApi._listenForResponse(callback)
								return Linking.openURL(response.url)
							}
						}).catch(err => console.error(err))
					}
				}).done()
			})
		})
	}

	static _listenForResponse(callback) {
		Linking.addEventListener('url', (event) => {
			if ( event.url ) {
				SpotifyWebApi.getAccessTokenFromScheme(event, (tokens) => {
					if ( callback && tokens ) {
						return callback(tokens)
					}
				})
			}
		});
	}

	static getAccessTokenFromScheme(event, callback) {

		if ( event ) {
			const queryVars = queryString.parse(event.url)

			AsyncStorage.getItem(STATE_KEY, (err, result) => {
				if ( result == queryVars.state ) {
					AsyncStorage.removeItem(STATE_KEY, (err, result) => {
						fetch(spotifyTokenURL, {
							method: 'POST',
							headers: {
								'Content-Type':'application/x-www-form-urlencoded',
								'Authorization': 'Basic ' + (new Buffer(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
							},
							body: queryString.stringify({
								code: queryVars['spotifyrn:/?code'],
								redirect_uri: REDIRECT_URI,
						        grant_type: 'authorization_code'
							})
						})
						.then(res => res.json())
						.then(res => {
							console.log('saving tokens')
					        if ( res.access_token && res.refresh_token ) {

					        	let tokens = [[ACCESS_TOKEN_KEY, res.access_token], [REFRESH_TOKEN_KEY, res.refresh_token]]

					        	console.log(res)

					        	AsyncStorage.multiSet(tokens, () => {
				        			if ( callback ) {
				        				var tokens = {
											access_token: res.access_token,
											refresh_token: res.refresh_token,
										}

							        	return callback(tokens)
				        			}
					        	})
					        }
					    }).done()
				    })
				} else {
			  		// Do something ???
			  	}
			})

		} else {
			console.log('no scheme content yet')
		}
	}

	static refreshAccessToken(refreshToken, callback) {
		return fetch(spotifyTokenURL, {
			method: 'POST',
			headers: {
				'Content-Type':'application/x-www-form-urlencoded',
				'Authorization': 'Basic ' + (new Buffer(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
			},
			body: queryString.stringify({
		        grant_type: 'refresh_token',
		        refresh_token: refreshToken,
			})
		})
		.then(res => res.json())
		.then(res => {
			console.log('getting new access token')
	        if ( res.access_token ) {
	        	AsyncStorage.setItem(ACCESS_TOKEN_KEY, res.access_token, () => {
		        	if ( callback ) {
		        		return callback(res.access_token)
		        	}
		        })
	        } else {
	        	// No access token returned
	        }
	    })
	}

	static getProfileDetails(accessToken) {

		return this.get(null, '/me/', accessToken)

	}

	// Return users playlists, takes optional limit & offset parameters
	static getPlaylists(accessToken, limit = FETCH_LIMIT, offset = 0) {

		let params = [
			`limit=${limit}`,
			`offset=${offset}`,
		].join('&');

	    return this.get(null, `/me/playlists?${params}`, accessToken)
	}



	// Get users top content, takes a required type path parameter, and optional limit, offset & time_range parameters
	static getUserTop(accessToken, type = 'artists', limit = FETCH_LIMIT, offset = 0, timeRange) {
		
		let params = [
			`limit=${limit}`,
			`offset=${offset}`,
			timeRange ? `time_range=${timeRange}` : null,
		].join('&');

		return this.get(null, `/me/top/${type}?${params}`, accessToken)
	}



	// Get recommendations based on seeds, takes an object with artists, tracks & genres
	static getRecommendations(accessToken, {artists, tracks, genres} = {}) {
		
		let params = [
			`seed_artists=${artists ? artists : ''}`,
			`seed_genres=${genres ? genres : ''}`,
			`seed_tracks=${tracks ? tracks : ''}`
		].join('&');

		return this.get(null, `/recommendations?${params}`, accessToken)
	}



	// Get featured playlists, takes optional country, locale, timestamp, limit & offset parameters
	static getFeaturedPlaylists(accessToken, country, locale, timestamp, limit = FETCH_LIMIT, offset = 0) {

		let params = [
			country ? `country=${country}` : null,
			locale ? `locale=${locale}` : null,
			timestamp ? `timestamp=${timestamp}` : null,
			`limit=${limit}`,
			`offset=${offset}`
		].join('&');

		return this.get(null, `/browse/featured-playlists?${params}`, accessToken)

	}



	// Get new releases, takes optional country, limit & offset parameters
	static getNewReleases(accessToken, country, limit = FETCH_LIMIT, offset = 0) {

		let params = [
			country ? `country=${country}` : null,
			`limit=${limit}`,
			`offset=${offset}`
		].join('&');

		return this.get(null, `/browse/new-releases?${params}`, accessToken)
	}



	// Get spotify categories, takes optional country, locale, limit & offset parameters
	static getCategories(accessToken, country, locale, limit = FETCH_LIMIT, offset = 0) {

		let params = [
			country ? `country=${country}` : null,
			locale ? `locale=${locale}` : null,
			`limit=${limit}`,
			`offset=${offset}`
		].join('&');

		return this.get(null, `/browse/categories?${params}`, accessToken)
	}

}

export default SpotifyWebApi