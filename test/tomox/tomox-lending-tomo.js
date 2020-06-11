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
    describe(`
    Test lending TOMO cases
    Steps:
    - Create a relayer
    - Issue token
    - Create BORROW/INVEST orders
    - Matched

    Checks:
    - Orderbook
    - Lender balances
    - Borrower balances
    - Relayer owner balance
    - Relayer deposited balance
    `, async () => {
        
        it(`it should work`, async () => {

            try {
                let term = 86400
                let tomoNative = '0x0000000000000000000000000000000000000001'
                let lockAddress= '0x0000000000000000000000000000000000000011'
                let tradeFee = 0.1
                let lendFee = 1
                let tokenDecimals = 8

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
                await tomojsR.send({ address: tomojsLA.coinbase, value: '20000', nonce: nonce + 2 })

                await sleep(5000)
                console.log(`Issue/ApplyTomoX token...`)

                let token = await tomojsI.tomoz.issueTRC21({
                    name: 'TEST',
                    symbol: 'TEST',
                    totalSupply: '100000',
                    decimals: tokenDecimals,
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
                    token: token.contractAddress,
                    depositRate: 150,
                    liquidationRate: 110,
                    recallRate: 200,
                    nonce: nonce
                })

                console.log(`Add lending token...`)
                await tomojsM.tomox.addLendingToken({
                    token: tomoNative,
                    nonce: nonce + 1
                })

                await sleep(5000)
                console.log(`Set collateral price...`)

                // Price TOMO/TEST
                await tomojsM.tomox.setCollateralPrice({
                    token: token.contractAddress,
                    lendingToken: tomoNative,
                    price: new BigNumber(10).multipliedBy(10 ** 18).toString(10),
                    nonce: nonce + 2
                })

                await sleep(5000)
                console.log(`Lending list token ${token.contractAddress}...`)

                await tomojsO.tomox.lendingUpdate({
                    node: C.address,
                    tradeFee: lendFee,
                    collateralTokens: [ '0x0000000000000000000000000000000000000000' ],
                    terms: [ term ],
                    lendingTokens: [ tomoNative ],
                    nonce: 1
                })

                await sleep(5000)
                console.log('Distributing TRC21...')

                await tomojsI.tomoz.transfer({
                    tokenAddress: token.contractAddress,
                    to: LB.address,
                    amount: 10000,
                    nonce: 2
                })

                await sleep(5000)

                let step0OwnerTOMOBalance = new BigNumber(await tomojsO.getBalance()).multipliedBy(10 ** 18)
                let step0LockAddressTokenBalance = new BigNumber((await tomojsO.tomoz.balanceOf({ tokenAddress: token.contractAddress, userAddress: lockAddress })).balanceBig)

                let step0OnwerTOMOBalance = new BigNumber(await tomojsO.getBalance()).multipliedBy(10 ** 18)
                expect((await tomojsO.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal('0', 'Step 0: wrong Relayer Owner Token balance')
                expect((await tomojsO.tomox.getRelayerByAddress(C.address)).deposit).to.equal('25000000000000000000000', 'Step 0: wrong Relayer Deposit')

                console.log(`Lending ...`)

                await tomojsLA.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: tomoNative,
                    collateralToken: token.contractAddress,
                    term: term,
                    interest: 9,
                    quantity: 1000,
                    side: 'INVEST',
                    nonce: 0
                })

                await tomojsLA.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: tomoNative,
                    collateralToken: token.contractAddress,
                    term: term,
                    interest: 10,
                    quantity: 1000,
                    side: 'INVEST',
                    nonce: 1
                })

                await sleep(5000)

                await tomojsLB.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: tomoNative,
                    collateralToken: token.contractAddress,
                    term: term,
                    interest: 8.5,
                    quantity: 1000,
                    side: 'BORROW',
                    nonce: 0
                })

                await tomojsLB.tomox.createLendingOrder({
                    relayerAddress: C.address,
                    lendingToken: tomoNative,
                    collateralToken: token.contractAddress,
                    term: term,
                    interest: 9,
                    quantity: 1000,
                    side: 'BORROW',
                    nonce: 1
                })

                await sleep(5000)


                let relayer = tomojsO.tomox.getRelayerByAddress(C.address)

                let step1LockAddressTokenBalance = new BigNumber((await tomojsO.tomoz.balanceOf({ tokenAddress: token.contractAddress, userAddress: lockAddress })).balanceBig)

                let step1OwnerTOMOBalance = new BigNumber(await tomojsO.getBalance()).multipliedBy(10 ** 18)

                expect(step1LockAddressTokenBalance.minus(step0LockAddressTokenBalance).dividedBy(10 ** tokenDecimals).toString(10)).to.equal('150', 'Step 1: wrong lock lending token balance')
                expect(step1OwnerTOMOBalance.minus(step0OwnerTOMOBalance).dividedBy(10 ** 18).toString(10)).to.equal('10', 'Step 1: wrong owner TOMO balance')

                expect(await tomojsLA.getBalance()).to.equal('19000.0', 'Step 1: wrong lender TOMO balance')
                expect((await tomojsLA.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal('0', 'Step 1: wrong lender token balance')

                expect(await tomojsLB.getBalance()).to.equal('990.0', 'Step 1: wrong borrower TOMO balance')
                expect((await tomojsLB.tomoz.balanceOf({ tokenAddress: token.contractAddress })).balance).to.equal('9850', 'Step 1: wrong borrower Token balance')

                expect((await tomojsO.tomox.getRelayerByAddress(C.address)).deposit).to.equal('24999990000000000000000', 'Step 1: wrong Relayer Deposit')

            } catch (e) {
                console.log(e)
            }
        })
    })
})
