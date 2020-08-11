require('isomorphic-fetch');

const dotenv = require('dotenv');
const Koa = require('koa');
const next = require('next');
const { default: createShopifyAuth } = require('@shopify/koa-shopify-auth');
const { verifyRequest } = require('@shopify/koa-shopify-auth');
const session = require('koa-session');

dotenv.config();
const { default: graphQLProxy } = require('@shopify/koa-shopify-graphql-proxy');

//for Webhook
const Router = require('koa-router');
const {receiveWebhook, registerWebhook} = require('@shopify/koa-shopify-webhooks');

const { ApiVersion } = require('@shopify/koa-shopify-graphql-proxy');
const getSubscriptionUrl = require('./server/getSubscriptionUrl');

const port = parseInt(process.env.PORT, 10) || 3000;
const dev = process.env.NODE_ENV !== 'production';

const app = next({ dev });
const handle = app.getRequestHandler();

const { SHOPIFY_API_SECRET_KEY, SHOPIFY_API_KEY, HOST } = process.env;


app.prepare().then(() => {
    const server = new Koa();
    const router = new Router();
    server.use(session({ secure: true, sameSite: 'none' }, server));
    server.keys = [SHOPIFY_API_SECRET_KEY];

    server.use(
        createShopifyAuth({
            //take the Shopify API key and the Shopify API secret key from your .env file
            apiKey: SHOPIFY_API_KEY,
            secret: SHOPIFY_API_SECRET_KEY,
            scopes: ['read_products', 'write_products'],

            //afterAuth can use your own logic or redirect
            async afterAuth(ctx) {
                const { shop, accessToken } = ctx.session;
                
                //to set cookies to use "sameSite" and "secure" for the app to load in Chrome.
                ctx.cookies.set('shopOrigin', shop, {
                    httpOnly: false,
                    secure: true,
                    sameSite: 'none'
                });

                //for webhook register
                const registration = await registerWebhook({
                    address: `${HOST}/webhooks/products/create`,
                    topic: 'PRODUCTS_CREATE',
                    accessToken,
                    shop,
                    apiVersion: ApiVersion.October19
                });
                if (registration.success) {
                        console.log('Successfully registered webhook!');
                    } else {
                        console.log('Failed to register webhook', registration.result);
                }

                //for subscription plan
                await getSubscriptionUrl(ctx, accessToken, shop);
            },
        }),
    );
    
    //for webhook subscription
    const webhook = receiveWebhook({secret: SHOPIFY_API_SECRET_KEY});
    router.post('/webhooks/products/create', webhook, (ctx) => {
        console.log('received webhook: ', ctx.state.webhook);
    });
    
    //Shopify koa middleware to securely proxy graphQL requests from Shopify, and api version.
    server.use(graphQLProxy({version: ApiVersion.October19}))
    //The verifyRequest redirects users to the OAuth route if they haven’t been authenticated.
    router.all('/(.*)', verifyRequest(), async (ctx) => {
        await handle(ctx.req, ctx.res);
        ctx.respond = false;
        ctx.res.statusCode = 200;
    });
    server.use(router.allowedMethods());
    server.use(router.routes());

    server.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`);
    });
});


