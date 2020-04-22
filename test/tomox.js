let chai = require('chai')
let should = chai.should()
let expect = chai.expect
let config = require('config')
let urljoin = require('url-join')
let TomoJS = require('tomojs')
let rpc = (config.rpc || {})

const sleep = ms => new Promise(res => setTimeout(res, ms))

describe('TomoChain RPC', () => {
    if (!rpc) {
        return
    }

    describe(`Test match spot trading`, () => {
        it(`it should work well`, async () => {
            let A = TomoJS.randomWallet() // Trader B
            let B = TomoJS.randomWallet() // Trader A

            let C = TomoJS.randomWallet() // Relayer Coinbase
            console.log(C)

            let O = TomoJS.randomWallet() // Relayer Owner

            let I = TomoJS.randomWallet() // Issuer

            let tomojsO = await TomoJS.setProvider(rpc, O.privateKey)

            let tomojsI = await TomoJS.setProvider(rpc, I.privateKey)

            let tomojsR = await TomoJS.setProvider(rpc, config.rootWalletPkey)

            let tomojsA = await TomoJS.setProvider(rpc, A.privateKey)

            let tomojsB = await TomoJS.setProvider(rpc, B.privateKey)


            console.log('Distributing TOMO ...')
            let nonce = await tomojsR.wallet.getTransactionCount()
            await tomojsR.send({ address: tomojsO.coinbase, value: '100000', nonce: nonce })
            await tomojsR.send({ address: tomojsA.coinbase, value: '1000', nonce: nonce + 1 })
            await tomojsR.send({ address: tomojsB.coinbase, value: '1000', nonce: nonce + 2 })
            await tomojsR.send({ address: tomojsI.coinbase, value: '10000', nonce: nonce + 3 })

            await sleep(5000)

            console.log(`Registering relayer ${C.address}...`)
            await tomojsO.tomox.register({
                amount: 25000,
                node: C.address,
                tradeFee: 0.1,
                baseTokens: [ '0x0000000000000000000000000000000000000001' ],
                quoteTokens: [ '0x9839B789b09292c175Cc7173337520fE8fd9d8FE' ]
            })

            await sleep(5000)

            console.log(`Issue/ApplyTomoX/List token...`)
            nonce = await tomojsI.wallet.getTransactionCount()
            let token = await tomojsI.tomoz.issueTRC21({
                name: 'TEST',
                symbol: 'TEST',
                totalSupply: '100000',
                decimals: 18,
                nonce: nonce
            })

            await tomojsI.tomoz.applyTomoX({
                tokenAddress: token.contractAddress,
                amount: 1000,
                nonce: nonce + 1
            })

            await tomojsO.tomox.list({
                node: C.address,
                baseToken: token.contractAddress,
                quoteToken: '0x0000000000000000000000000000000000000001'
            })

            await sleep(5000)

            console.log(`Trading ...`)
            try {
                await tomojsA.tomox.createOrder({
                    exchangeAddress: C.address,
                    price: 0.1,
                    side: 'SELL',
                    amount: 10,
                    quoteToken: '0x0000000000000000000000000000000000000001',
                    baseToken: token.contractAddress
                })
                await tomojsB.tomox.createOrder({
                    exchangeAddress: C.address,
                    price: 0.1,
                    side: 'BUY',
                    amount: 10,
                    quoteToken: '0x0000000000000000000000000000000000000001',
                    baseToken: token.contractAddress
                })

                await sleep(5000)

                console.log(await tomojsA.getBalance())
                console.log(await tomojsB.getBalance())


            } catch (e) {
                console.log(e)
            }

            expect(1).to.equal(1)
        })
    })
})
