const chai = require('chai')
const should = chai.should()
const expect = chai.expect
const config = require('config')
const BigNumber = require('bignumber.js')
const urljoin = require('url-join')
const ethers = require('ethers')
const axios = require('axios')
const wrapperAbi = require('../abis/WrapperAbi.json')

let wallet, senderWallet
let address, senderAddress
let provider, senderProvider
let depositAddress
let wrapperContract
let depositAmount = new BigNumber(0.02).multipliedBy(10 ** config.get('bridge.eth.decimals')).toString(10) // 0.02 eth

const sleep = m => new Promise(res => setTimeout(res, m))

describe('WTH workflow', () => {
    beforeEach(async function () {
        try {
            provider = new ethers.providers.JsonRpcProvider(config.get('bridge.blockchain.tomoRpc'))
            senderProvider = new ethers.providers.JsonRpcProvider(config.get('bridge.blockchain.ethRpc'))
            wallet = new ethers.Wallet(config.get('bridge.receiverPk'), provider)
            senderWallet = new ethers.Wallet(config.get('bridge.senderETHPk'), senderProvider)
            address = wallet.address
            senderAddress = senderWallet.address

            wrapperContract = new ethers.Contract(
                config.get('bridge.eth.wrapperAddress'),
                wrapperAbi.abi,
                wallet
            )
        } catch (error) {
            throw error
        }
    })

    describe('Deposit eth', () => {
        it('Testing balance before and after deposit', async () => {
            try {
                const getAddressData = await axios.post(
                    urljoin(config.get('bridge.serverAPI'), 'address'),
                    {
                        coin: 'eth',
                        tomo: address
                    }
                )
                depositAddress = getAddressData.data.address
                // trc21 balance of
                let trc21ethBalanceBefore = wrapperContract.functions.balanceOf(address)

                // deposit eth
                const txParams = {
                    nonce: await senderProvider.getTransactionCount(senderAddress),
                    gasPrice: await senderProvider.getGasPrice(),
                    gasLimit: ethers.utils.hexlify(2000000),
                    value: ethers.utils.parseEther('0.02'),
                    to: depositAddress
                }
                // sign tx
                const signedTx = await senderWallet.sign(txParams)
                // send signed tx
                const response = await senderProvider.sendTransaction(signedTx)
                console.log(response)

                let apiData, inTx, outTx
                await sleep(180000)
                apiData = await axios.get(
                    urljoin(config.get('bridge.serverAPI'), 'transactions/eth', address, 'deposit/latest')
                )
                console.log(apiData.data)
                inTx = apiData.data.transaction.InTx
                outTx = apiData.data.transaction.OutTx
                // same tx hash
                expect(response.hash).to.equal(inTx.Hash)
                // same amount
                expect(new BigNumber(depositAmount).toString(10)).to.equal(new BigNumber(outTx.Amount).toString(10))
                // exact deposit address
                expect(depositAddress.toLowerCase()).to.equal(inTx.To.toLowerCase())
                // exact sender address
                expect(response.from.toLowerCase()).to.equal(inTx.From.toLowerCase())

                const trc21ethBalanceAfter = await wrapperContract.functions.balanceOf(address)
                
                const expectTrc21Balance = new BigNumber(await trc21ethBalanceBefore).plus(new BigNumber(depositAmount)).toString(10)

                // // receive exact amount
                expect(new BigNumber(trc21ethBalanceAfter).toString(10)).to.equal(expectTrc21Balance)
            } catch (error) {
                throw error
            }
        })
    })
    describe.skip('Withdraw eth', () => {
        it('Testing balance before and after withdraw', async () => {
            // check trc21 balance before withdraw
            const trc21USDTBalanceBefore = await wrapperContract.functions.balanceOf(address)
            // check main balance before withdraw
            const mainBalanceBefore = await senderProvider.getBalance(senderAddress)

            // withdraw
            const txParams = {
                nonce: await provider.getTransactionCount(address),
                gasPrice: await provider.getGasPrice(),
                gasLimit: ethers.utils.hexlify(2000000)
            }
            // sign tx
            const response = await wrapperContract.functions.burn(
                depositAmount,
                string2bytes(senderAddress),
                txParams
            )
            console.log(response)
            await sleep(180000)

            const url = urljoin(
                config.get('bridge.serverAPI'),
                '/transactions',
                'eth',
                address,
                'withdraw',
                'latest'
            )
            const apiData = await axios.get(url)
            console.log(apiData.data)

            const inTx = apiData.data.transaction.InTx
            const outTx = apiData.data.transaction.OutTx
            const withdrawFee = await wrapperContract.functions.WITHDRAW_FEE()

            // check tx hash
            expect(response.hash).to.equal(inTx.Hash)
            // receiver address
            expect(senderAddress.toLowerCase()).to.equal(outTx.To.toLowerCase())

            // check trc21 balance after
            const trc21BalanceAfter = await wrapperContract.functions.balanceOf(address)
            const expectTrc21Balance = new BigNumber(trc21USDTBalanceBefore).minus(new BigNumber(depositAmount)).toString(10)
            expect(new BigNumber(trc21BalanceAfter).toString(10)).to.equal(new BigNumber(expectTrc21Balance).toString(10))

            // check main balance after
            const mainBalanceAfter = await senderProvider.getBalance(senderAddress)
            const receiveAmount = new BigNumber(depositAmount).minus(new BigNumber(withdrawFee))
            const expectMainBalance = new BigNumber(mainBalanceBefore).plus(receiveAmount)

            expect(new BigNumber(mainBalanceAfter).toString()).to.equal(new BigNumber(expectMainBalance).toString(10))
        })
    })
})
