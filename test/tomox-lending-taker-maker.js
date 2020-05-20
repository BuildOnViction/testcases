let chai = require('chai')
let should = chai.should()
let expect = chai.expect
let config = require('config')
let urljoin = require('url-join')
let TomoJS = require('tomojs')
let BigNumber = require('bignumber.js')
let rpc = (config.rpc || {})

const sleep = ms => new Promise(res => setTimeout(res, ms))

describe('TomoX testcases', () => {
    if (!rpc) {
        return
    }
    describe(`Test spot trading orderbook and trades`, async () => {
        
        it(`it should work`, async () => {

            try {
                let term = 86400
                let tomoNative = '0x0000000000000000000000000000000000000001'
                let lockAddress= '0x0000000000000000000000000000000000000011'
                let tradeFee = 0.1
                let lendFee = 1

                let LA = TomoJS.randomWallet() // Lender A

                let LB = TomoJS.randomWallet() // Borrower B

                let C = TomoJS.randomWallet() // Relayer Coinbase

                let O = TomoJS.randomWallet() // Relayer Owner

                let I = TomoJS.randomWallet() // Issuer

                let tomojsO = await TomoJS.setProvider(rpc, O.privateKey)

                let tomojsI = await TomoJS.setProvider(rpc, I.privateKey)

                let tomojsR = await TomoJS.setProvider(rpc, config.rootWalletPkey)
                let tomojsM = await TomoJS.setProvider(rpc, config.mainWalletPkey)


                let tomojsLA = await TomoJS.setProvider(rpc, LA.privateKey)

                let tomojsLB = await TomoJS.setProvider(rpc, LB.privateKey)


                console.log('Distributing TOMO ...')

                let nonce = await tomojsR.wallet.getTransactionCount()
                await tomojsR.send({ address: tomojsO.coinbase, value: '100000', nonce: nonce })
                await tomojsR.send({ address: tomojsI.coinbase, value: '10000', nonce: nonce + 1 })
                await tomojsR.send({ address: tomojsLB.coinbase, value: '10000', nonce: nonce + 2 })

                await sleep(5000)
                console.log(`Issue/ApplyTomoX token...`)

                let token = await tomojsI.tomoz.issueTRC21({
                    name: 'TEST',
                    symbol: 'TEST',
                    totalSupply: '100000',
                    decimals: 18,
                    nonce: 0
                })

                await tomojsI.tomoz.applyTomoX({
                    tokenAddress: token.contractAddress,
                    amount: 1000,
                    nonce: 1
                })

                await sleep(5000)
                console.log(`Registering relayer ${C.address}...`)

                await tomojsO.tomox.register({
                    amount: 25000,
                    node: C.address,
                    tradeFee: tradeFee,
                    baseTokens: [ token.contractAddress ],
                    quoteTokens: [ tomoNative ],
                    nonce: 0
                })

                console.log(`Add collateral ...`)
                nonce = await tomojsM.wallet.getTransactionCount()
                await tomojsM.tomox.addCollateral({
                    token: tomoNative,
                    depositRate: 150,
                    liquidationRate: 110,
                    recallRate: 200,
                    nonce: nonce
                })

                console.log(`Add lending token...`)
                await tomojsM.tomox.addLendingToken({
                    token: token.contractAddress,
                    nonce: nonce + 1
                })

                await sleep(5000)
                console.log(`Set collateral price...`)

                // Price TOMO/TEST
                await tomojsM.tomox.setCollateralPrice({
                    token: tomoNative,
                    lendingToken: token.contractAddress,
                    price: new BigNumber(10).multipliedBy(1e18).toString(10),
                    nonce: nonce + 2
                })

                await sleep(5000)
                console.log(`Lending list token ${token.contractAddress}...`)

                await tomojsO.tomox.lendingUpdate({
                    node: C.address,
                    tradeFee: lendFee,
                    collateralTokens: [ '0x0000000000000000000000000000000000000000' ],
                    terms: [ term ],
                    lendingTokens: [ token.contractAddress ],
                    nonce: 1
                })

                await sleep(5000)
                console.log('Distributing TRC21...')

                await tomojsI.tomoz.transfer({
                    tokenAddress: token.contractAddress,
                    to: LA.address,
                    amount: 20000,
                    nonce: 2
                })

                await sleep(5000)

                let step0OwnerTOMOBalance = new BigNumber(await tomojsO.getBalance()).multipliedBy(10 ** 18)
                let step0LockAddressTOMOBalance = new BigNumber(await tomojsO.getBalance(lockAddress)).multipliedBy(10 ** 18)

                expect((await tomojsO.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal('0', 'Step 0: wrong Relayer Owner TOMO balance')
                expect((await tomojsO.tomox.getRelayerByAddress(C.address)).deposit).to.equal('25000000000000000000000', 'Step 0: wrong Relayer Deposit')

                console.log(`Lending ...`)

                await tomojsLB.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: token.contractAddress,
                    collateralToken: tomoNative,
                    term: term,
                    interest: 8.5,
                    quantity: 1000,
                    side: 'BORROW',
                    nonce: 0
                })

                await tomojsLB.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: token.contractAddress,
                    collateralToken: tomoNative,
                    term: term,
                    interest: 9,
                    quantity: 1000,
                    side: 'BORROW',
                    nonce: 1
                })

                await sleep(5000)


                await tomojsLA.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: token.contractAddress,
                    collateralToken: tomoNative,
                    term: term,
                    interest: 9,
                    quantity: 1000,
                    side: 'INVEST',
                    nonce: 0
                })

                await tomojsLA.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: token.contractAddress,
                    collateralToken: tomoNative,
                    term: term,
                    interest: 10,
                    quantity: 1000,
                    side: 'INVEST',
                    nonce: 1
                })

                await sleep(5000)

                let relayer = tomojsO.tomox.getRelayerByAddress(C.address)

                let bids = tomojsR.tomox.getBids( token.contractAddress, tomoNative )
                let asks = tomojsR.tomox.getAsks( token.contractAddress, tomoNative )

                let borrows = tomojsR.tomox.getBorrows( token.contractAddress, term )
                let invests = tomojsR.tomox.getInvests( token.contractAddress, term )

                let step1LockAddressTOMOBalance = new BigNumber(await tomojsO.getBalance(lockAddress)).multipliedBy(10 ** 18)

                expect(step1LockAddressTOMOBalance.minus(step0LockAddressTOMOBalance).dividedBy(10 ** 18).toString(10)).to.equal('150', 'Step 1: wrong lock lending TOMO balance')

                expect((await tomojsO.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal('10', 'Step 1: wrong owner Token balance')

                expect((await borrows)['850000000'].toString(10)).to.equal('1e+21', 'Step 1: wrong borrows orderbook')
                expect((await invests)['1000000000'].toString(10)).to.equal('1e+21', 'Step 1: wrong borrows orderbook')

                expect(await tomojsLA.getBalance()).to.equal('0.0', 'Step 1: wrong lender TOMO balance')
                expect((await tomojsLA.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal('19000', 'Step 1: wrong lender token balance')

                expect(await tomojsLB.getBalance()).to.equal('9850.0', 'Step 1: wrong borrower TOMO balance')
                expect((await tomojsLB.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal('990', 'Step 1: wrong borrower TOMO balance')

                expect((await tomojsO.tomox.getRelayerByAddress(C.address)).deposit).to.equal('24999990000000000000000', 'Step 1: wrong Relayer Deposit')

            } catch (e) {
                console.log(e)
            }
        })
    })
})
