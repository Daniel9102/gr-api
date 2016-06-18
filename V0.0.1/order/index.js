'use strict';
module.exports = function(M,B) {
    var rest = B.rest;
    return function(args){
        var act = args.action;
        delete args.action;
        return rest.invoke('/order/'+act||'',args);
    }
}