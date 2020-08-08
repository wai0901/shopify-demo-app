require('isomorphic-fetch');

const dotenv = require('dotenv');
const Koa = require('koa');
const next = require('next');
const { default: createShopifyAuth } = require('@shopify/koa-shopify-auth');
const { verifyRequest } = require('@shopify/koa-shopify-auth');
const session = require('koa-session');

dotenv.config();
const { default: graphQLProxy } = require('@shopify/koa-shopify-graphql-proxy');
const { ApiVersion } = require('@shopify/koa-shopify-graphql-proxy');

const port = parseInt(process.env.PORT, 10) || 3000;
const dev = process.env.NODE_ENV !== 'production';

const app = next({ dev });
const handle = app.getRequestHandler();

const { SHOPIFY_API_SECRET_KEY, SHOPIFY_API_KEY } = process.env;


app.prepare().then(() => {
    const server = new Koa();

    server.use(session({ secure: true, sameSite: 'none' }, server));
    server.keys = [SHOPIFY_API_SECRET_KEY];

    server.use(
        createShopifyAuth({
            //take the Shopify API key and the Shopify API secret key from your .env file
            apiKey: SHOPIFY_API_KEY,
            secret: SHOPIFY_API_SECRET_KEY,
            scopes: ['read_products', 'write_products'],

            //afterAuth can use your own logic or redirect
            afterAuth(ctx) {
                const { shop, accessToken } = ctx.session;
                
                //to set cookies to use "sameSite" and "secure" for the app to load in Chrome.
                ctx.cookies.set('shopOrigin', shop, {
                    httpOnly: false,
                    secure: true,
                    sameSite: 'none'
                });

                ctx.redirect('/');
            },
        }),
    );
    
    //Shopify koa middleware to securely proxy graphQL requests from Shopify, and api version.
    server.use(graphQLProxy({version: ApiVersion.October19}))
    //The verifyRequest redirects users to the OAuth route if they haven’t been authenticated.
    server.use(verifyRequest());

    server.use(async (ctx) => {
        await handle(ctx.req, ctx.res);
        ctx.respond = false;
        ctx.res.statusCode = 200;
        return
    });

    server.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`);
      });
});


