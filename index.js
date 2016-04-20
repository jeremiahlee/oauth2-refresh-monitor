'use strict';

const Hapi = require('hapi');
const Request = require('request');
const EnvBang = require('envbang-node');

// Verify required env vars set
var envbang = new EnvBang(['PORT','PROJECT_URL','clientId','clientSecret','refreshMinTime','refreshMaxTime']);
envbang.check();

const server = new Hapi.Server();
server.connection({ port: process.env.PORT });

var initialized = false;
var initializedTime;
var refreshAccessTokenTimeout;
var refreshToken;

// ROUTES
server.route({
    method: 'GET',
    path: '/',
    handler: function(request, reply) {
        if (initialized === true) {
            reply(`Running since ${initializedTime}`);
        } else {
            // Redirect to OAuth 2.0 Authorization Code Flow
            reply.redirect(`https://www.fitbit.com/oauth2/authorize?response_type=code&client_id=${process.env.clientId}&scope=profile&redirect_uri=https%3A%2F%2F${process.env.PROJECT_URL}%2Fauthed&prompt=consent`);
        }
    }
});

server.route({
    method: 'GET',
    path: '/authed',
    handler: function(req, reply) {
        console.log('authed', req.query.code);
        // Exchange authorization code for access token
        Request.post({
            uri: 'https://api.fitbit.com/oauth2/token',
            headers: {
                'Authorization': 'Basic ' + new Buffer(`${process.env.clientId}:${process.env.clientSecret}`).toString('base64')
            },
            form: {
                client_id: process.env.clientId,
                grant_type: 'authorization_code',
                code: req.query.code,
                redirect_uri: `https://${process.env.PROJECT_URL}/authed`
            }
        }, function (e, r, body) {
            let authorizationResponse = JSON.parse(body);

            if (authorizationResponse.errors) {
                return reply(`Error obtaining consent: ${body}`);
            } else {
                refreshToken = authorizationResponse.refresh_token;

                initialized = true;
                initializedTime = new Date();

                setRefreshAccessTokenTimeout();

                return reply.redirect('/');
            }
        });
    }
});

// REFRESH TOKEN TIMER
var getRandomIntInclusive = function getRandomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

var setRefreshAccessTokenTimeout = function setRefreshAccessTokenTimeout() {
    let timeUntilRefresh = getRandomIntInclusive(Number(process.env.refreshMinTime), Number(process.env.refreshMaxTime));
    console.log(new Date(), `Next refresh in ${timeUntilRefresh} milliseconds`);
    console.log(' ');

    refreshAccessTokenTimeout = setTimeout(refreshAccessToken, timeUntilRefresh);
}

var refreshAccessToken = function refreshAccessToken() {
    console.log(new Date(), `Refreshing token: ${refreshToken}`);

    Request.post({
        uri: 'https://api.fitbit.com/oauth2/token',
        headers: {
            'Authorization': 'Basic ' + new Buffer(`${process.env.clientId}:${process.env.clientSecret}`).toString('base64')
        },
        form: {
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        }
    }, function (e, r, body) {
        let refreshResponse = JSON.parse(body);

        if (refreshResponse.errors) {
            console.error(`Error refreshing token: ${body}`);
        } else {
            refreshToken = refreshResponse.refresh_token;
            console.log(new Date(), `Token refreshed: ${refreshToken}`);

            setRefreshAccessTokenTimeout();
        }
    });
};

// START IT UP
server.start((err) => {
    if (err) {
        throw err;
    }
    console.log(`Server running at: ${server.info.uri}`);
});