## Test Cases for TomoX Protocol

### Use
- NodeJS 10+
- Chai, Chai-Http
- Mocha


### Install
```
npm install
```

### Config

Create `config/local.json`
```
cp config/default.json config/local.json
```
Update the config file to match with your env.


### Test

The basic tests:
```
npm run test/tomox.js

# Test create a new relayer
# Test list trading/lending pairs
# Test trading
# Test lending
# Test cancel trading/lending
# Test manual topup
# Test manual repay
```

You also create your own test cases
