const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'GitHub Repo Watcher API',
            version: '1.0.0',
            description: 'Service for tracking GitHub repositories and notifying about new releases',

            contact: {
                name: "Olga Shabak",
                email: "olgashabak@gmail.com"
            },
        },

        externalDocs: {
            description: "GitHub repository",
            url: "https://github.com/olgashabak-osh/github-repo-watcher-for-gen",
        },

        tags: [
            {
                name: 'Health',
                description: 'Server status',
            },
            {
                name: 'Subscriptions',
                description: 'Manage subscriptions',
            },
        ],

        servers: [
            {
                url: 'http://localhost:3000',
            },
        ],
    },
    apis: ['./server.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = {
    swaggerUi,
    swaggerSpec,
};