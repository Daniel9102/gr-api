var should = require('chai').should();
var AE = require("apiengine")({mode:'STAGING',scope:'ec',appkey:'45883198abcdc107',masterKey:'1b7e5703602b6fce1cae7364ac0f2244'});
describe('Function', function(){
    it('call function', function(done){
        var func = new AE.Function('ec.server.giveMemberTimingCoupons');
        func.invoke({}).then(function(data){
            console.log(data);
            done();
        }).catch(function(err){
            done(err);
        });
    });

    /*
    it('find', function(done){
        var query = new AE.Query('api_webevent');
        query.and(" status>0 ");
        query.find().then(function(data){
            console.log(data);
            done();
        }).catch(function(err){
            console.log('err');
            done(err);
        });
    });//*/
});