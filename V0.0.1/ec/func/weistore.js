/**
 * Created by Nico on 2016/3/31.
 */
var Q = require('q');
var async = require('async');
var _ = require('underscore');
var m = require('moment');
var E = require('../../../error');
var L = require('../../../logger.js');

module.exports = function(M,B){
    var api = B.api;
    M.weistore = {
        //首页精选分类及分类下的商品展示
        getHomepageClassify:function(args){
            var q = Q.defer() ;
            async.auto({
                f0: function (cb) {
                    var arg = {
                        table: 'gr_classify',
                        condition: 'status = 1 and ishomeshow=1',
                        sort: 'ordnum+',
                        fields: 'id,title,ordnum,gjz,fileurl'
                    };
                    M.find(arg).then(function (data) {
                        if (data.length > 0) {
                            //成功找到
                            cb(null, data)
                        } else {
                            //没有，退出程序
                            cb(E.WeiStore.FIND_NOTHING)
                        }
                    })
                },
                f1: function (cb) {
                    var sql = "select a.id cid,a.title cname,a.ordnum,b.id pid,b.name,b.photourlarray ,c.grprice,c.name specname " +
                        "from gr_classify a ,gr_product b,gr_product_spec c " +
                        "where a.id = b.cid and a.status = 1 " +
                        "and b.status = 1 and a.ishomeshow = 1 and c.pid =b.id and b.minPrice=c.grprice " +
                        "and a.status=1 order by a.ordnum asc,b.id asc" ;
                    M.adapter.query(sql, function (err, data) {
                        if (err) {
                            cb(E.WeiStore.QUERY_ERROR);
                        } else {
                            cb(null, data);
                        }
                    })
                },
                f2: ["f0","f1",function (cb,result) {
                    if (result.f0.length > 0) {
                        var f = [] ;
                        async.eachSeries(result.f0, function(c,cb1){
                            var cla = {name: c.title,fileurl: c.fileurl} ;
                            var pro = [];
                            async.eachSeries(result.f1,function(p,cb2){
                                if(p.cid === c.id){
                                    pro.push({id: p.pid,name: p.name,imgurl: p.photourlarray,grprice: p.grprice,specname: p.specname}) ;
                                }
                                cb2(null)
                            },function(){
                                cla['productlist'] = pro ;
                                f.push(cla);
                                cb1(null);
                            });
                        },function(){
                            cb(null, f);
                        });
                    }else{
                        cb(E.WeiStore.FIND_NOTHING)
                    }
                }]
            },function(err,result){
                if(err){
                    q.reject(err);
                }else{
                    q.resolve(result.f2);
                }
            });
            return q.promise;
        },
        /**
         * 加入购物车和更新购物车
         * @param args:{uid:'',pid:'',psid:'',number:'',mold:'',checked:''}
         * @returns {*|d.promise|Function|promise|r.promise}
         */
        updateCart:function(args){
            var q = Q.defer() ;
            var uid = args.uid,
                pid = args.pid,
                psid = args.psid,
                number = args.number || 0,//数量增减
                mold = args.mold || 0,
                checked = args.checked || 0,//
                all_num = args.all_num || -1; //全部，直接输入数量时使用，允许直接更新number
            async.auto({
                f0:function(cb){
                    //根据uid、pid、psid到购物车内查找
                   var arg = {
                       table:'gr_user_cart',
                       condition:" uid ='"+uid+"' and pid = '"+pid+"' and psid = '"+psid+"'"
                   };
                   M.first(arg).then(function(data){
                       if(data.id){
                            //找到，更新
                           cb(null, {errno:0,data:data})
                       }else{
                           //未找到，插入
                           cb(null, {errno:1})
                       }
                   });
                },
                f1:function(cb){

                    //根据psid找到对应商品的库存
                    var arg = {
                        table:'gr_product_spec',
                        condition:" id = '"+psid+"' and status = 1"
                    };
                    M.first(arg).then(function(data){
                        if(data.id){
                            //找到，更新
                            cb(null, data)
                        }else{
                            //未找到，插入
                            cb(E.WeiStore.FIND_NOTHING)
                        }
                    });
                },
                f2:['f0','f1',function(cb,result){
                    if(result.f0.errno === 0){
                        var cInfo = result.f0.data ;
                        var new_num = parseInt(cInfo.number) + parseInt(number) ;
                        if(all_num != -1){
                            new_num = all_num ;
                        }
                        if(parseInt(result.f1.inventory) - new_num < 0){
                            new_num = parseInt(result.f1.inventory) ;
                        }
                        if(checked===1){
                            var arg = {
                                table:'gr_user_cart',
                                condition:" uid='"+uid+"'",
                                row:{
                                    checked:0,
                                    updateAt : Math.floor(_.now()/1000)
                                }
                            };
                            var arg1 = {
                                table:'gr_user_cart',
                                condition:" uid ='"+uid+"' and pid = '"+pid+"' and psid = '"+psid+"'",
                                row:{
                                    number:new_num,
                                    checked:1,
                                    updateAt : Math.floor(_.now()/1000)
                                }
                            };
                            M.update(arg).then(function(data){
                                M.update(arg1).then(function(data){
                                    cb(null, {errno:0});
                                }).catch(function(err){
                                    cb(E.Object.CREATE_ERROR);
                                })
                            }).catch(function(err){
                                M.update(arg1).then(function(data){
                                    cb(null, {errno:0});
                                }).catch(function(err){
                                    cb(E.Object.CREATE_ERROR);
                                })
                            })
                        }else{
                            //更新
                            var arg = {
                                table:'gr_user_cart',
                                condition:" uid ='"+uid+"' and pid = '"+pid+"' and psid = '"+psid+"'",
                                row:{
                                    number:new_num,
                                    updateAt : Math.floor(_.now()/1000)
                                }
                            };
                            M.update(arg).then(function(data){
                                if(parseInt(result.f1.inventory) - new_num < 0){
                                    cb(null, {errno:-1});
                                }else{
                                    cb(null, {errno:0});
                                }
                            }).catch(function(err){
                                cb(E.Object.UPDATE_ERROR);
                            })
                        }
                    }else{

                        var now = Math.floor(_.now()/1000);
                        var new_num = parseInt(number);
                        if(parseInt(result.f1.inventory) - parseInt(number) < 0){
                            new_num = parseInt(result.f1.inventory) ;
                        }
                        //checked===1表示只允许当前的商品默认选中，其他的checked状态变为0
                        if(checked===1){
                            var arg = {
                                table:'gr_user_cart',
                                condition:" uid='"+uid+"'",
                                row:{
                                    checked:0,
                                    updateAt : now
                                }
                            };
                            var arg1 = {
                                table:'gr_user_cart',
                                row:{
                                    uid:uid,
                                    pid:pid,
                                    psid:psid,
                                    mold:mold,
                                    checked:1,
                                    number:new_num,
                                    createAt : now ,
                                    updateAt : now
                                }
                            };
                            M.update(arg).then(function(data){
                                M.create(arg1).then(function(data){
                                    cb(null, {errno:0});
                                }).catch(function(err){
                                    cb(E.Object.CREATE_ERROR);
                                })
                            }).catch(function(err){
                                M.create(arg1).then(function(data){
                                    cb(null, {errno:0});
                                }).catch(function(err){
                                    cb(E.Object.CREATE_ERROR);
                                })
                            })
                        }else{
                            var arg = {
                                table:'gr_user_cart',
                                row:{
                                    uid:uid,
                                    pid:pid,
                                    psid:psid,
                                    mold:mold,
                                    checked:1,
                                    number:new_num,
                                    createAt : now ,
                                    updateAt : now
                                }
                            };
                            M.create(arg).then(function(data){
                                cb(null, {errno:0});
                            }).catch(function(err){
                                cb(E.Object.CREATE_ERROR);
                            })
                        }
                    }
                }],
            },function(err,result){
                if(err){
                    q.reject(err);
                }else{
                    q.resolve(result.f2);
                }
            });
            return q.promise ;
        },
        /**
         *购物车删除商品
         * @param args:{uid:'',pid:'',psid:''}
         * @returns {*|d.promise|Function|promise|r.promise}
         */
        deleteCart:function(args){
            var q = Q.defer() ;
            var uid = args.uid,
                pid = args.pid,
                psid = args.psid;
            var arg = {
                table:'gr_user_cart',
                condition:" uid ='"+uid+"' and pid = '"+pid+"' and psid = '"+psid+"'",
                row:{
                    delflag:1,
                    updateAt: Math.floor(_.now()/1000)
                }
            };
            M.update(arg).then(function(){
                q.resolve({errno:0})
            }).catch(function(){
                q.reject(E.Object.UPDATE_ERROR);
            });
            return q.promise;
        },
        /**
         * 根据uid显示购物车首页（商品列表，价格，总价，优惠信息）
         * 价格计算规则：
         * args:uid
         * @param args
         * @returns {*|d.promise|Function|promise|r.promise}
         */
        cartHome:function(args){
            var q = Q.defer() ;
            var uid = args.uid ;
            async.auto({
                f0:function(cb){
                    var arg = {
                        table:'gr_user_cart',
                        condition:"uid = '"+uid+"' "
                    };
                    M.find(arg).then(function(data){
                        if(data.length > 0){
                            //找到
                            var psids = [],
                                ids = [];
                            async.eachSeries(data,function(e,cb1){
                                psids.push(e.psid);
                                ids.push(parseInt(e.pid)) ;
                                cb1(null);
                            },function(){
                                //psids = psids.toString();
                                cb(null, {data:data,psids:psids,ids:ids});
                            });
                        }else{
                            //未找到，显示空
                            cb(E.WeiStore.FIND_NOTHING);
                        }
                    });
                },
                f1:['f0',function(cb,result){
                    //根据找到的购物车数据，拼接购物车商品列表
                    var sql = "select a.id pid,a.name pname,a.picurlarray,b.id psid,b.name specname,b.inventory ,b.grprice " +
                        "from gr_product a,gr_product_spec b " +
                        "where a.id = b.pid and b.id in ("+result.f0.psids.join(',')+") and b.inventory>0 and b.status=1 and a.status=1" ;
                    M.adapter.query(sql,function(err,data){
                        if(err){
                            cb(err)
                        }else{
                            cb(null, data);
                        }
                    });
                }],
                f2:['f1',function(cb,result){
                    //计算价格
                    var prolist = [],
                        list = [];
                    var amount = 0,
                        disscount = 0 ;
                    async.eachSeries(result.f0.data, function(c,cb1){
                        async.eachSeries(result.f1,function(p,cb2){
                            if(parseInt(c.psid) === parseInt(p.psid) && _.indexOf([4,5],c.mold)<0){
                                var price = parseFloat(p.grprice) * parseInt(c.number) * parseFloat(c.probability) ;
                                var total = parseFloat(p.grprice) * parseInt(c.number) ;
                                var dis = parseFloat(total - price).toFixed(2) ;
                                list.push(p.pid);
                                if(c.checked === 1){
                                    amount = (parseFloat(amount) + parseFloat(price)).toFixed(2);
                                    disscount = (parseFloat(disscount) + parseFloat(dis)).toFixed(2);
                                }
                                p['pid']= p.pid ;
                                p['picurlarray'] = JSON.parse(p.picurlarray)[0];
                                p['pname'] = p.pname ;
                                p['mold'] = c.mold ;
                                p['number'] = c.number ;
                                p['discount'] = dis ;
                                p['checked'] = c.checked ? true:false;
                                prolist.push(p);
                            }
                            cb2(null);
                        },function(){
                            cb1(null);
                        })
                    },function(){

                        productlist=[];
                        dellist=_.difference(result.f0.ids,list);
                        havedel=false;
                        for (var i=0;i<prolist.length;i++){
                            if(_.indexOf(dellist,parseInt(prolist[i].pid))<0){
                                productlist.push(prolist[i]);
                            }else{
                                havedel=true;
                            }
                        }
                        if(productlist.length>0){
                            cb(null, {errno:0,prolist:productlist, amount:amount,discount:disscount,dellist:dellist,havedel:havedel});
                        }else{
                            cb(E.WeiStore.CART_NO_GOODS);
                        }

                    });
                }],
                f3:['f2',function(cb,result){
                    //清理购物车
                    if(result.f2.dellist.length <= 0){
                        //无需清理
                        cb(null, result.f2)
                    }else{
                        //清理
                        var arg = {
                            table:'gr_user_cart',
                            condition:" pid in ("+result.f2.dellist.join(',')+")"
                        };
                        M.clear(arg).then(function(data){
                            cb(null, result.f2)
                        }).catch(function(err){
                            cb(err);
                        });
                    }
                }]
            },function(err,result){
                if(err){
                    q.reject(err);
                } else{
                    q.resolve(result.f2);
                }
            });
            return q.promise ;
        },
        /**
         * 更新购物车选中状态
         * @param args:{uid:必选,checked:必选,psid:可选}
         * @returns {*|d.promise|Function|promise|r.promise}
         */
        checkedCartPro:function(args){
            var uid = args.uid,
                psid = args.psid || "",
                checked = args.checked ;
            var q = Q.defer() ;
            var arg = {
                table:'gr_user_cart',
                condition:"uid='"+uid+"'"+(_.isEmpty(psid)?"":" and psid='"+psid+"'" ),
                row:{
                    updateAt: Math.floor(_.now()/1000),
                    checked:checked
                }
            };
            M.update(arg).then(function(data){
                q.resolve({errno:0})
            }).catch(function(){
                q.reject(E.Object.UPDATE_ERROR);
            });
            return q.promise ;
        },
        /**
         * 获取加价购商品
         * @param args
         * @returns {*|d.promise|Function|promise|r.promise}
         */
        jiaJiaInfo:function(args){
            var q = Q.defer() ;
            var cid = "2" ;
            var sql = "SELECT b.id psid ,b.pid,b.grprice,b.name ,a.name pname,a.picurlarray " +
                "FROM gr_product a,gr_product_spec b, gr_classify c " +
                "where a.cid=c.id and c.gjz='jjg' and a.status = 1 and b.inventory>0 and b.status=1 and a.id=b.pid limit 10"
            M.adapter.query(sql, function(err,data){
                if(err){
                    q.reject(err);
                }else{
                    var proList = [] ;
                    async.eachSeries(data,function(e,cb){
                        proList.push({
                            pid: e.pid,
                            psid: e.psid,
                            name: e.name,
                            pname: e.pname,
                            grprice:e.grprice,
                            imgurl:JSON.parse(e.picurlarray)[0]
                        });
                        cb(null);
                    },function(){
                        q.resolve(proList);
                    });
                }
            });
            return q.promise ;
        },
        /**
         * 根据uid获取购物车数据、购物车商品信息、优惠券信息、地址信息、活动余额抵扣
         * @param args
         * @returns {*|d.promise|Function|promise|r.promise}
         */
        confirmOrder:function(args){
            var uid = args.uid ;
            var q = Q.defer() ;
            async.auto({
                f0:function(cb){
                    //获取默认地址
                    var arg = {
                        table:'gr_user_addr',
                        condition:" uid = '"+uid+"' and status=1 and isDefault=1",
                        //fields:"id,uid,name,phone,address,isDefault,province,city,area,street"
                    };
                    api.first(arg).then(function(data){
                        cb(null, data)
                    });
                },
                //获取购物车数据,计算好价格、优惠
                f1:function(cb){
                    M.util.getCartInfoForAll(M,uid,1).then(function(data){
                        cb(null, data)
                    }).catch(function(err){
                        cb(err)
                    })
                },
                f2:function(cb){
                    //获取用户数据的id/point/balance/gCoin
                    M.util.getUser(api,uid).then(function(data){
                        cb(null, {id:data.id,point:data.point, balance:data.balance,gCoin:data.gCoin,level:data.level});
                    }).catch(function(err){
                        cb(err);
                    })
                },
                //计算活动余额抵扣、优惠券数据,会员折扣
                f3:['f1','f2',function(cb,result){
                    var total = result.f1.amount,
                        gCoin = result.f2.gCoin,
                        memberTotal=result.f1.memberAmount;
                    var memberDiscount =  M.util.memberDiscountjisuan(memberTotal,result.f2.level);
                    var disGCoin = M.util.chuliGCoin(parseFloat(total)-parseFloat(memberDiscount), gCoin) ;//抵扣的活动余额
                    var vailCoupons = 0 ; //可用优惠券张数
                    M.util.getUserCoupons(M,uid,parseFloat(total)-parseFloat(memberDiscount)).then(function(data){
                        cb(null, {level:result.f2.level,disGCoin:disGCoin,vailCoupons:data.length,memberDiscount:memberDiscount});
                    }).catch(function(err){
                        cb(err);
                    });

                }],
                final:["f0","f1","f2","f3",function(cb,result){
                    cb(null, {
                        address:result.f0,
                        prolist:result.f1.prolist,
                        user:result.f2,
                        amount:parseFloat(result.f1.amount)-parseFloat(result.f3.memberDiscount),
                        discount:result.f1.discount,
                        mayDiscount:result.f3,
                        points:result.f1.points,
                        act_pro:result.f1.act_pro
                    })
                }]
            },function(err,result){
                if(err){
                    q.reject(err);
                }else{
                    q.resolve(result.final)
                }
            });
            return q.promise;
        },
        /**
         * 计算可用活动余额，传入参数：当前订单金额，用户id：uid
         * @param args
         * @returns {*|d.promise|Function|promise|r.promise}
         */
        getGcoinValid:function(args){
            var amount = args.amount,
                uid = args.uid ;
            var q = Q.defer() ;
            M.util.getUser(api,uid).then(function(data){
                q.resolve(chuliGCoin(amount, data.gCoin));
            }).catch(function(err){
                q.reject(err);
            });
            return q.promise;
        },
        /**
         * 获取（可用、全部）优惠券
         * @param args：uid:"",amount:""
         * @returns {*|d.promise|Function|promise|r.promise}
         */
        getCoupons:function(args){
            var uid = args.uid,
                amount =args.amount || -1 ;
            var q = Q.defer() ;
            M.util.getUserCoupons(M,uid,amount).then(function(data){
                q.resolve(data);
            }).catch(function(err){
                q.reject(err);
            });
            return q.promise;
        },
        /**
         * 变更gr_user_addr表的默认状态
         * @param args
         * @returns {*|d.promise|Function|promise|r.promise}
         */
        changeAddrDefault:function(args){
            var q = Q.defer() ;
            var uid = args.uid,
                addr_id = args.addr_id ;
            async.waterfall([
                function(cb){
                    var arg = {
                        table:'gr_user_addr',
                        condition:" uid='"+uid+"' and status=1",
                        row:{
                            isDefault:0
                        }
                    };
                    api.update(arg).then(function(data){
                        cb(null);
                    }).catch(function(err){
                        cb(null);
                    });
                },
                function(cb){
                    var arg = {
                        table:'gr_user_addr',
                        condition:" uid='"+uid+"' and status=1 and id="+addr_id,
                        row:{
                            isDefault:1,
                            updateAt:Math.floor(_.now()/1000)
                        }
                    };
                    api.update(arg).then(function(data){
                        cb(null,{errno:0});
                    }).catch(function(err){
                        cb(E.Object.UPDATE_ERROR);
                    });
                }
            ],function(err,result){
                if(err){
                    q.reject(err);
                } else{
                    q.resolve(result);
                }
            });
            return q.promise;
        },
        /**
         * 根据订单状态获取订单列表
         * @param args
         * @returns {*|d.promise|Function|promise|r.promise}
         */
        getOrdersByStatus:function(args){
            var status = args.status,
                uid = args.uid,
                page = args.page || 0,
                pageSize = 5,
                s_flag = args.s_flag || 0;
            var skip = page * pageSize ;
            var q = Q.defer() ;
            async.waterfall([
                function(cb){
                    var sql = "select a.orderid,a.groupNo,a.type,a.status,a.q_flag,a.s_flag, b.pid ,c.picurlarray,d.finalAmount " +
                        "from gr_final_order a, gr_final_order_goods b ,gr_product c,gr_final_order_group d " +
                        "where a.orderid = b.orderid and "+(_.isArray(status)?"a.status in ("+status.join(',')+")":"a.status="+status)+ " and c.id=b.pid and d.groupNo=a.groupNo and d.uid='"+uid+"'"+
                        (s_flag===0?"":" and a.s_flag>="+s_flag)+
                        " order by d.payTime desc limit "+skip+","+pageSize;
                    M.adapter.query(sql,function(err,data){
                        if(err){
                            cb(err)
                        }else{
                            cb(null, data);
                        }
                    });
                },
                function(l,cb){
                    var list = [] ;
                    if(_.isArray(l)){
                        async.eachSeries(l,function(e,cb1){
                            if(_.isEmpty(list)){
                                var img = [];
                                img.push(JSON.parse(e.picurlarray)[0]);
                                list.push(
                                    {
                                        s_flag: e.s_flag,
                                        q_flag: e.q_flag,
                                        groupNo: e.groupNo,
                                        orderid: e.orderid,
                                        status: e.status,
                                        finalAmount: e.finalAmount,
                                        imgUrl:img
                                    }
                                );
                                cb1(null);
                            }else{
                                var flag = false ;
                                async.eachSeries(list,function(f,cb2){
                                    if(f.orderid === e.orderid){
                                        flag = true ;
                                        if(f['imgUrl'].length <3){
                                            f['imgUrl'].push(JSON.parse(e.picurlarray)[0])
                                        }
                                    }
                                    cb2(null);
                                },function(){
                                    if(!flag){
                                        //没有更新到任何list，则创建一条var img = [];
                                        var img = [];
                                        img.push(JSON.parse(e.picurlarray)[0]);
                                        list.push(
                                            {
                                                s_flag: e.s_flag,
                                                q_flag: e.q_flag,
                                                groupNo: e.groupNo,
                                                orderid: e.orderid,
                                                status: e.status,
                                                finalAmount: e.finalAmount,
                                                imgUrl:img
                                            }
                                        );
                                    }
                                    cb1(null);
                                })
                            }
                        },function(){
                            cb(null, list);
                        })
                    }else{
                        cb(null, list);
                    }
                }
            ],function(err,result){
                if(err){
                    q.reject(err);
                }else{
                    q.resolve(result);
                }
            })
            return q.promise ;
        },
        /**
         * 订单支付时调用
         * @param args
         * @returns {*|d.promise|Function|promise|r.promise}
         */
        orderPay:function(args){
            var q = Q.defer() ;
            var groupNo = args.groupNo,
                uid = args.uid ;
            async.auto({
                f0:function(cb){
                    //根据订单组号查询订单组的所有信息
                    var arg = {
                        table:"gr_final_order_group",
                        condition:"groupNo='"+groupNo+"'"
                    };
                    M.first(arg).then(function(data){
                        cb(null, data);
                    }).catch(function(err){
                        cb(err);
                    });
                },
                f1:function(cb){
                    //根据uid获取用户的余额
                    M.util.getUser(api,uid).then(function(data){
                        if(data.id){
                            cb(null, data.balance);
                        }else{
                            cb(E.WeiStore.FIND_NOTHING);
                        }
                    }).catch(function(err){
                        cb(err);
                    })
                },
                f2:function(cb){
                    //根据订单组号获取所有子订单订单号
                    var arg = {
                        table:"gr_final_order",
                        condition:"groupNo = '" + groupNo +"'",
                        fields:"orderid"
                    };
                    M.find(arg).then(function(data){
                        var orderidstr = "";
                        if(!_.isEmpty(data)){
                            async.eachSeries(data, function(e,cb1){
                                orderidstr = orderidstr + e.orderid + " ";
                                cb1(null);
                            },function(){
                                cb(null,orderidstr);
                            })
                        }else{
                            cb(E.WeiStore.FIND_NOTHING);
                        }
                    })
                },
                final:['f0','f1','f2',function(cb,result){
                    cb(null, {group:result.f0,balance:result.f1, orderidstr:result.f2});
                }]
            },function(err,result){
                if(err){
                    q.reject(err);
                }else{
                    q.resolve(result.final);
                }
            });
            return q.promise;
        },
        //获取用户地址
        userAddress:function(args){
            var q = new Q.defer();
            async.auto({
                f1:function(callback,result){
                    where = "uid='"+args.uid+"'";
                    api.find({table:'gr_user_addr',condition:where}).then(function(d){
                        callback(null,d);
                    }).catch(function(err){
                        callback(err);
                    });
                }
            },function(err,result){
                if(err){
                    q.reject(err);
                }else{
                    q.resolve(result);
                }
            })
            return q.promise;
        },
        //商品相关
        getProductInfo:function(args){
            var id = args.id ;
            var q = Q.defer() ;
            M.util.getProductInfoById(M,id).then(function(data){
                q.resolve(data);
            }).catch(function(err){
                q.reject(err);
            })
            return q.promise;
        },
        getProductBySpecid:function(args){
            var q= Q.defer();
            var sql = "SELECT b.name pname,b.id pid,c.id specid,b.picurlarray,c.name specname,c.grprice,b.bin " +
                "FROM gr_product b,gr_product_spec c " +
                "where c.pid="+args.pid+" and c.id="+args.specid+" and c.pid = b.id ";
            M.adapter.query(sql,function(err,data){
                if(err){
                    callback(err)
                }else{
                    var proList = [] ;
                    async.eachSeries(data,function(e,cb1){
                        proList.push({
                            pname: e.pname,
                            specname: e.specname,
                            grprice: e.grprice,
                            pid: e.pid,
                            specid: e.specid,
                            bin: e.bin,
                            imgUrl:JSON.parse(e.picurlarray)[0]
                        });
                        cb1(null);
                    },function(err){
                        if(err){
                            q.reject(err);
                        }else{
                            q.resolve(proList);
                        }
                    })
                }
            })
            return q.promise;
        },
        //个人中心 start
        evaluation:function(args){
            var goods = args.goods,
                uid = args.uid,
                orderid = args.orderid,
                courier = args.courier ;
            var now = Math.floor(_.now()/1000);
            var q = Q.defer() ;
            async.auto({
                f0_1:function(cb){
                    //根据uid获取用户昵称和headimgurl
                    var arg = {
                        table:"gr_login_info",
                        id:uid
                    };
                    api.get(arg).then(function(data){
                        cb(null, data);
                    }).catch(function(err){
                        cb(err);
                    })
                },
                f0:['f0_1',function(cb,result){
                    var user = result.f0_1 ;
                    async.eachSeries(goods, function(e,cb1){
                        e['uid'] = uid ;
                        e['uname'] = user.nickname ||"null";
                        e['uhead'] = user.headimgurl ||"null" ;
                        e['orderid'] = orderid;
                        e['createAt'] = now ;
                        e['updateAt'] = now ;
                        cb1(null);
                    },function(){
                        cb(null,goods)
                    })
                }],
                f1:function(cb){
                    courier['uid'] = uid ;
                    courier['orderid'] = orderid;
                    courier['createAt'] = now ;
                    courier['updateAt'] = now ;
                    cb(null,courier);
                },
                f2:['f0',function(cb,result){
                    //保存商品评论
                    var arg = {
                        table:"gr_goods_commentn",
                        row:result.f0
                    };
                    M.create(arg).then(function(data){
                        cb(null, data);
                    }).catch(function(){
                        cb(E.Object.CREATE_ERROR)
                    });
                }],
                f3:['f1',function(cb,result){
                    //保存快递员评论
                    var arg = {
                        table:"gr_logistics_comment",
                        row:result.f1
                    };
                    M.create(arg).then(function(data){
                        cb(null, data);
                    }).catch(function(){
                        cb(E.Object.CREATE_ERROR)
                    });
                }],
                final:['f2','f3',function(cb,result){
                    //后期需要补充添加经验等其他
                    cb(null, {errno:0})
                }]
            },function(err,result){
                if(err){
                    q.reject(err);
                }else{
                    q.resolve(result.final);
                }
            });
            return q.promise;
        },
        clearOutTimeOrders:function(args){
            var q = Q.defer() ;
            M.util.clearOutTimeOrders(M).then(function(data){
                q.resolve(data);
            }).catch(function(err){
                q.reject(err);
            });
            return q.promise;
        },
        clearOutTimeCartPro:function(args){
            var q = Q.defer() ;
            M.util.clearOutTimeCartPro(M).then(function(data){
                q.resolve(data);
            }).catch(function(err){
                q.reject(err);
            });
            return q.promise;
        },
        /**
         * 获取我的推荐列表
         * @param args
         * @returns {*|d.promise|Function|promise|r.promise}
         */
        myRecommendList:function(args){
            var q = Q.defer();
            var uid = args.uid ;
            var sql = "select a.id pid,a.name pname,a.picurlarray,b.content,b.likecount ,b.createAt " +
                "from gr_product a ,gr_goods_commentn b " +
                "where a.id=b.pid and a.status=0 and b.uid="+uid+" order by b.createAt desc ";
            M.adapter.query(sql,function(err,data){
                if(err){
                    q.reject(err);
                }else{
                    async.eachSeries(data,function(e,cb){
                        e['picurlarray'] = JSON.parse(e.picurlarray)[0];
                        cb(null);
                    },function(){
                        q.resolve(data);
                    })
                }
            });
            return q.promise;
        },
        //个人中心 end
        //探索接口 start
        /**
         * 展示探索首页的文章信息
         * @param args
         * @returns {*|d.promise|Function|promise|r.promise}
         */
        exploration:function(args){
            //显示默认推荐文章
            var q = Q.defer() ;
            async.auto({
                f0_1:function(cb){
                    var arg = {
                        table:"gr_exploration",
                        condition:"delflag=0",
                        fields:"id,ptags,article,product"
                    };
                    M.first(arg).then(function(data){
                        if(data){
                            cb(null, data);
                        }else{
                            cb(null, []);
                        }
                    });
                },
                f0: ['f0_1',function (cb,result) {
                    //根据标签id显示获取标签名称
                    var sql = "SELECT a.id,a.ptags from gr_product_ptags a where a.id in ("+result.f0_1.ptags.split(",").join(',')+") order by a.id asc";
                    M.adapter.query(sql, function (err, data) {
                        if (err) {
                            cb(err);
                        } else {
                            cb(null, data)
                        }
                    });
                }],
                f1: ['f0_1',function (cb,result) {
                    //获取商品
                    var sql = "SELECT c.id pid,c.name pname,c.picurlarray ,c.minPrice,c.ptags," +
                        "c.recommend likecount ,c.sales " +
                        "FROM gr_product c " +
                        "where c.id in ("+result.f0_1.product.split(",").join(',')+")";
                    L.info(sql);
                    M.adapter.query(sql, function (err, data) {
                        if (err) {
                            cb(err);
                        } else {
                            async.eachSeries(data, function (e, cb1) {
                                if (!_.isEmpty(e.ptags)) {
                                    e['ptags'] = e.ptags.split(',');
                                } else {
                                    e['ptags'] = [];
                                }
                                e['picurlarray'] = JSON.parse(e.picurlarray)[0];
                                cb1(null);
                            }, function () {
                                cb(null, data);
                            });
                        }
                    });
                }],
                f2:['f0_1',function (cb,result) {
                    var sql = "select * from gr_article b where b.id in ("+result.f0_1.article.split(",").join(',')+") order by b.articletype desc"
                    M.adapter.query(sql, function(err,data){
                        if(err){
                            cb(err);
                        }else{
                            if(!_.isEmpty(data)){
                                async.eachSeries(data,function(e,cb1){
                                    e['img'] = JSON.parse(e.picurlarray)[0] ;
                                    cb1(null);
                                },function(){
                                    cb(null, data);
                                })
                            }else{
                                cb(null, []);
                            }
                        }
                    });
                }],
                final:['f1','f2','f0', function (cb,result) {
                    var list = [];
                    async.eachSeries(result.f2, function (e, cb1) {
                        list.push({
                            title: e.articletitle,
                            abstract: e.articleintroduce,
                            type: e.articletype,
                            img: e.img,
                            id: e.id,
                            read_rate: e.read_rate,
                            zan: e.zan,
                            prolist: (e.articletype === 2 ? result.f1 : [])
                        });
                        cb1(null);
                    }, function () {
                        cb(null, {article:list,ptags:result.f0});
                    })
                }]
            },function(err,result){
                console.log(err);
                if(err){
                    q.reject(err);
                }else{
                    q.resolve(result.final);
                }
            });
            return q.promise;
        },
        getExplorationDefaultPro:function(args){
            //显示默认推荐文章
            var q = Q.defer() ;
            async.auto({
                f0:function(cb){
                    var arg = {
                        table:"gr_exploration",
                        condition:"delflag=0",
                        fields:"id,article,ptags,product"
                    };
                    M.first(arg).then(function(data){
                        if(data){
                            cb(null, data);
                        }else{
                            cb(null, []);
                        }
                    });
                },
                f1: ['f0',function (cb,result) {
                    //获取商品
                    var sql = "SELECT c.id pid,c.name pname,c.picurlarray ,c.minPrice,c.ptags," +
                        "c.recommend likecount ,c.sales " +
                        "FROM gr_product c " +
                        "where c.id in ("+result.f0.product.split(",").join(',')+")";
                    M.adapter.query(sql, function (err, data) {
                        if (err) {
                            cb(err);
                        } else {
                            async.eachSeries(data, function (e, cb1) {
                                if (!_.isEmpty(e.ptags)) {
                                    e['ptags'] = e.ptags.split(',');
                                } else {
                                    e['ptags'] = [];
                                }
                                e['picurlarray'] = JSON.parse(e.picurlarray)[0];
                                cb1(null);
                            }, function () {
                                cb(null, data);
                            });
                        }
                    });
                }]
            },function(err,result){
                if(err){
                    q.reject(err);
                }else{
                    q.resolve(result.f1);
                }
            });
            return q.promise;
        },
        /**
         * 根据id获取文章详情和推荐、关联商品
         * @param args
         * @returns {*|d.promise|Function|promise|r.promise}
         */
        article:function(args){
            var q = Q.defer();
            var id = args.id,
                uid = args.uid;
            async.waterfall([
                function(cb){
                    //判断当天的阅读次数，小于三次，每次阅读添加1空气
                    M.util.personalReads(M,{uid:uid,id:id}).then(function(data){
                        cb(null);
                    }).catch(function(err){
                        cb(null);
                    })
                },
                function(cb){
                    var arg = {
                        table:'gr_article',
                        id:id
                    };
                    M.get(arg).then(function(data){
                        cb(null, data);
                    }).catch(function(err){
                        cb(err);
                    });
                },
                function(article,cb){
                    //根据article的内的collocation展示商品
                    if(!_.isEmpty(article.articlecollocation)){
                        var pids = article.articlecollocation.split(",") ;
                        M.util.getProductByIds(M,pids).then(function(data){
                            cb(null, {article:article,prolist:data});
                        }).catch(function(err){
                            cb(err);
                        });
                    }else{
                        cb(null, {article:article,prolist:[]});
                    }
                },
                function(d,cb){
                    M.util.getArticleList(M).then(function(data){
                        cb(null, {article: d.article,prolist: d.prolist,art_list:data});
                    }).catch(function(){
                        cb(null, {article: d.article,prolist: d.prolist,art_list:[]});
                    })
                }
            ],function(err,result){
                if(err){
                    q.reject(err);
                }else{
                    q.resolve(result);
                }
            });
            return q.promise ;
        },
        /**
         * 获取全部文章列表
         * @param args
         * @returns {*|d.promise|Function|promise|r.promise}
         */
        articleList:function(args){
            var q = Q.defer() ;
            M.util.articleList(M,args).then(function(data){
                q.resolve(data);
            }).catch(function(err){
                q.reject(err);
            });
            return q.promise;
        },
        searchProByPtags:function(args){
            var pname = args.name ||'null',
                ptags = args.ptags ||'null',
                order = args.order||'null',
                sort = args.sort ||'null';

            var q = Q.defer() ;
            M.util.getProductByKey(M,{pname:pname,ptags:ptags,order:order,sort:sort}).then(function(data){
                q.resolve(data)
            }).catch(function(err){
                q.reject(err);
            });
            return q.promise;
        },
        searchProByPName:function(args){
            var pname = args.name ||'null',
                ptags = args.ptags ||'null',
                order = args.order ||'null',
                sort = args.sort  ||'null';
            var q = Q.defer() ;
            M.util.getProductByKey(M,{pname:pname,ptags:ptags,order:order,sort:sort}).then(function(data){
                q.resolve(data)
            }).catch(function(err){
                q.reject(err);
            });
            return q.promise;
        },
        searchPro:function(args){
            var pname = args.name,
                ptags = args.ptags,
                order = args.order,
                sort = args.sort ;
            var q = Q.defer() ;
            M.util.getProductByKey(M,{pname:pname,ptags:ptags,order:order,sort:sort}).then(function(data){
                q.resolve(data)
            }).catch(function(err){
                q.reject(err);
            });
            return q.promise;
        },
        getArticleZan:function(args){
            var q = Q.defer() ;
            var id = args.id,
                uid = args.uid ;
            M.util.getArticleZan(M,{uid:uid,id:id}).then(function(data){
                q.resolve(data)
            }).catch(function(err){
                q.reject(err);
            });
            return q.promise;
        },
        articleZan:function(args){
            var q = Q.defer() ;
            var id = args.id,
                uid = args.uid ;
            M.util.articleZan(M,{uid:uid,id:id}).then(function(data){
                q.resolve(data )
            }).catch(function(err){
                q.reject(err);
            });
            return q.promise;
        },
        //探索接口 end
        //显示全部商品，可以分页，可以搜索
        getAllProudct:function(args){
            var q = Q.defer() ;
            var name = args.name || undefined,
                //order = args.order==='p'?"b.minPrice":args.order==='r'?"b.recommend":"b.sales",//关键字：order by xx
                order = args.order==='p'?"b.minPrice":args.order==='r'?"b.updateAt":"b.sales",//关键字：order by xx
                sort = (args.sort===undefined)?"desc": args.sort,//sort:asc or desc
                page = args.page || 0,
                pageSize = 20 ;
            var sql = "select b.id,b.name,b.intro,b.picurlarray,b.photourlarray,b.ptags,b.minPrice,b.sales,b.recommend " +
                " from gr_classify a ,gr_product b" +
                " where a.isshow=1 and a.status=1 and a.id=b.cid and a.delflag=0 and b.status=1 and b.delflag=0 " +
                (name?" and b.name like '%"+name+"%'":"")+
                " order by "+order+" "+sort+
                " limit "+page*pageSize+","+pageSize;
            L.info(sql);
            M.adapter.query(sql,function(err,data){
                if(err){
                    q.reject(err);
                }else{
                    async.eachSeries(data,function(e,cb){
                        e['picurlarray'] = JSON.parse(e.picurlarray)[0];
                        e['ptags'] = (_.isEmpty(e.ptags)?[]: e.ptags.split(','));
                        cb(null);
                    },function(){
                        q.resolve(data);
                    });
                }
            });
            return q.promise;
        },
        //会员升级，成长值增加
        addExp:function(args){
            var q = Q.defer();
            var now = Math.floor(_.now()/1000);
            var uid=args.uid,
                aid=args.aid,
                title = args.title;
            async.auto({
                f0_1:function(cb){
                    //获取会员升级表
                    var arg={
                        table:"gr_member_level",
                        fields:"name,score"
                    };
                    M.find(arg).then(function(data){
                        if(!_.isEmpty(data)){
                            var s = _.indexBy(_.sortBy(data,'name'),"name");
                            //var l = s[_.size(s)-1];
                            cb(null,s);
                        }else{
                            cb(E.WeiStore.FIND_NOTHING)
                        }
                    }).catch(function(err){
                        cb(E.WeiStore.FIND_NOTHING)
                    })
                },
                f0:function(cb){
                    //获取当天参与的次数，根据title+uid+aid
                    var start = m(new Date()).format("YYYY-MM-DD");//parseInt(new Date().setHours(0,0,0)/1000);
                    var arg = {
                        table:"gr_experience_flow",
                        condition:"uid="+uid+" and title='"+title+"' and date_format(from_unixtime(createAt),'%Y-%m-%d')='"+start +"'"
                    };
                    M.count(arg).then(function(data){
                        cb(null, data);
                    }).catch(function(err){
                        cb(err);
                    });
                },
                f1_1:function(cb){
                    var arg = {
                        table:"gr_experience_flow",
                        condition:"uid="+uid+" and aid='"+aid+"' and title='"+title+"'"
                    };
                    M.count(arg).then(function(data){
                        cb(null, data);
                    }).catch(function(err){
                        cb(err);
                    });
                },
                f1:['f0','f1_1',function(cb,result){
                    switch (title){
                        case "阅读文章":
                            if(result.f0 >=3 && result.f1_1>0){
                                //不发放
                                cb(null, 0);
                            }else{
                                cb(null, 1);
                            }
                            break;
                        case "分享文章":
                            if(result.f0 >=3 && result.f1_1>0){
                                //不发放
                                cb(null, 0);
                            }else{
                                cb(null, 2);
                            }
                            break;
                        case "收集到赞":
                            if(result.f0 >=10 && result.f1_1>0){
                                //不发放
                                cb(null, 0);
                            }else{
                                cb(null, 1);
                            }
                            break;
                        case "成功推荐":
                            //推荐成功，必须传递groupNo，否则会有异常
                            var arg = {
                                table:"gr_final_order_group",
                                condition:"groupNo='"+aid+"'"
                            };
                            M.first(arg).then(function(data){
                                if(data){
                                    cb(null, Math.floor(data.finalAmount/2)+2);
                                }else{
                                    L.info("没有找到对应的GroupNo");
                                    cb(null, 2);
                                }
                            }).catch(function(err){
                                L.info("没有找到对应的GroupNo");
                                cb(null, 0);
                            });
                            break;
                        case "团购活动":
                            break;
                        case "预售活动":
                            break;
                    }
                }],
                f2:['f1',function(cb,result){

                    if(result.f1 <=0){
                        //不能发放经验
                        cb(null, {code:1,msg:'no exp'})
                    }else{
                        //插入流水并发放经验
                        var arg = {
                            table:"gr_experience_flow",
                            row:{
                                uid:uid,
                                aid:aid,
                                title:title,
                                createAt:now,
                                updateAt:now,
                                exp:result.f1
                            }
                        };
                        M.create(arg).then(function(){
                            var sql = "update gr_login_info set grow=grow+"+result.f1+" where id="+uid;
                            api.adapter.query(sql,function(err,data){
                                if(err){
                                    cb(err);
                                }else{
                                    cb(null, {code:0});
                                }
                            });
                        }).catch(function(err){
                            cb(err);
                        })
                    }
                }],
                f3:['f2','f0_1','f1',function(cb,result){
                    if(result.f2.code === 0){
                        //更新了经验，需要验证是否需要升级
                        M.util.getUser(api,uid).then(function(data){
                            //cb(null, data.level >= result.f0_1[_.size(result.f0_1)-1].name);
                            if(data.level >= _.max(_.sortBy(result.f0_1),'name').name ){
                                //达到顶级，无需升级
                                cb(null, {code:1,msg:'顶级VIP用户，无需升级',level:data.level,newGrow:result.f1});
                            }else{
                                L.info(data.grow);
                                L.info(result.f0_1[parseInt(data.level+1)+""]);
                                if(data.grow >= result.f0_1[parseInt(data.level+1)+""].score){
                                    //升级
                                    var sql = "update gr_login_info set level=level+1 where id="+uid;
                                    api.adapter.query(sql,function(err,data1){
                                        if(err){
                                            cb(err);
                                        }else{
                                            cb(null, {code:0,msg:'升级成功',level:parseInt(data.level)+1,newGrow:result.f1});
                                        }
                                    });
                                }else{
                                    //无需升级
                                    cb(null, {code:1,msg:'无需升级',level:data.level,newGrow:result.f1});
                                }
                            }
                        })
                    }else{
                        cb(null, {code:2,msg:'没有获取经验'});
                    }
                }]
            },function(err, result){
                if(err){
                    q.reject(err);
                }else{
                    q.resolve(result.f3);
                }
            });
            return q.promise;
        },
        //下发优惠券
        sendCoupon:function(args){
            var q = Q.defer(),
                uid=args.uid,
                cid=args.cid,
                now=Math.floor(_.now()/1000),
                limit=args.limit||1;
            async.auto({
                f3:function(callback,result){
                    map={
                        table:"gr_survey",
                        condition:"cid="+cid+" and type='C'",
                    }
                    M.find(map).then(function(d){
                        callback(null,d[0]);
                    }).catch(function(e){
                        callback(null,"");
                    })
                },
                f0:function(callback,result){
                    map={
                        table:"gr_user_coupon",
                        condition:"uid='"+uid+"' and cid='"+cid+"'"
                    }
                    M.find(map).then(function(d){
                        callback(null,d.length)
                    }).catch(function(e){
                        callback(e);
                    })
                },
                f1: ['f0',function (callback,result) {
                    map={
                        table:"gr_coupons",
                        condition:"id="+cid,
                    }
                    M.find(map).then(function(d){
                        callback(null,d[0]);
                    }).catch(function(e){
                        callback(e);
                    });
                }],
                f2:['f1',function(callback,result){
                    if(parseInt(result.f0)>=limit){
                        callback(E.WeiStore.COUPON_ALREADY_ACCEPTED);
                    }else{
                        data={
                            table:"gr_user_coupon",
                            row:{
                                uid:uid,
                                cid:result.f1.id,
                                createAt:now,
                                updateAt:now,
                                used:0,
                                GiveTime:now,
                                coupon:result.f1.cname||'',
                                validityStartPeriod:now,
                                validityEndPeriod:parseInt(now)+7*86400
                            }
                        }
                        M.create(data).then(function(d){
                            callback(null,d);
                        }).catch(function(e){
                            callback(e);
                        })
                    }
                }]
            },function(e,result){
                if(e){
                    q.reject(e)
                }else{
                    q.resolve(result)
                }
            });
            return q.promise;
        },
        //判断是否为新用户，返回跳转地址
        newuser:function(args){
            var q = Q.defer(),
                uid=args.uid;
            async.series({
                start: function(callback){
                    map={
                        table:"gr_config",
                        condition:" name='NEWUSERSTARTTIME'"
                    }
                    M.first(map).then(function(d){
                        callback(null,d);
                    }).catch(function(err){
                        callback(err);
                    })
                },
                end: function(callback){
                    map={
                        table:"gr_config",
                        condition:" name='NEWUSERENDTIME'"
                    }
                    M.first(map).then(function(d){
                        callback(null,d);
                    }).catch(function(err){
                        callback(err);
                    })
                },
                url: function(callback){
                    map={
                        table:"gr_config",
                        condition:"name='NEWUSERURL'"
                    }
                    M.first(map).then(function(d){
                        callback(null,d);
                    }).catch(function(err){
                        callback(err);
                    })
                },
                user:function(callback){
                    map={
                        table:"gr_login_info",
                        condition:"id="+args.uid
                    }
                    api.first(map).then(function(d){
                        callback(null,d);
                    }).catch(function(err){
                        callback(err);
                    })
                },
                //领完一次之后不会再跳到指定页面
                update:function(callback){
                    data={
                        table:"gr_login_info",
                        condition:"id="+args.uid,
                        row:{
                            lastlogintime:Math.floor(_.now()/1000)
                        }
                    }
                    api.update(data).then(function(d){
                        callback(null,d)
                    }).catch(function(err){
                        callback(err);
                    })
                }
            },function(err,result){
                if(err){
                    console.log(err);
                    q.resolve('');
                }else{
                    //创建时间在活动时间内，创建时间和更新时间一样
                    if(parseInt(result.user.createAt)>parseInt(result.start.value)*1000&&parseInt(result.user.createAt)<parseInt(result.end.value)*1000&&result.user.lastlogintime==null){
                        q.resolve(result.url.value);
                    }else{
                        q.resolve('')
                    }
                }
            })
            return q.promise;
        },
        /**
         * 老用户验证接口
         */
        getolduserinfo:function(args){
            var q = Q.defer(),
                login_name=args.login_name,
                pwd=args.pwd,
                resultObj={};
            async.waterfall([
                function(callback){
                    map={
                        table:"gr_pc_user",
                        condition:" login_name='"+login_name+"' and pwd='"+pwd+"' and user_type=2"
                    }
                    M.find(map).then(function(d){
                        if(d.length>0){
                            resultObj.login_name=d[0]['login_name'];
                            resultObj.old_uid=d[0]['id'];
                            callback(null,d[0]);
                        }else{
                            callback(E.WeiStore.PC_LOGIN_ERR);
                        }
                    }).catch(function(err){
                        callback(err);
                    })
                },
                function (user,callback){
                    if(user['vipcard_id']==null){
                        resultObj.balance=0;
                        resultObj.is_submit=0;
                        resultObj.is_trans=0;
                        callback(null,{});
                    }else{
                        map={
                            table:"gr_pc_vipcard",
                            condition:" id="+user['vipcard_id']
                        }
                        M.find(map).then(function(d){
                            if(d.length>0){
                                resultObj.balance=d[0]['balance'];
                                resultObj.is_submit=user['is_submit'];
                                resultObj.is_trans=user['is_trans'];
                                callback(null,{});
                            }else{
                                resultObj.balance=0;
                                resultObj.is_submit=0;
                                resultObj.is_trans=0;
                                callback(null,{});
                            }
                        }).catch(function(err){
                            callback(err);
                        })
                    }
                },
            ],function(err,result){
                if(err){
                    q.reject(err);
                }else{
                    q.resolve(resultObj);
                }
            })
            return q.promise;
        },
        /**
         * 余额转入提交申请接口
         */
        oldtranssubmit:function(args){
            var q = Q.defer(),
                old_uid=args.old_uid,
                uid=args.uid,
                resultObj={};
            async.waterfall([
                function(callback){
                    var map={
                        table:"gr_pc_user",
                        condition:" id="+old_uid+" and is_trans=0 and is_submit=0 and is_vip=1"
                    }
                    M.find(map).then(function(d){
                        if(d.length>0){
                            callback(null,d[0])
                        }else{
                            callback(E.WeiStore.YOU_NOT_ALLOW_APPLY_TRANS)
                        }
                    })
                },
                function(user,callback){
                    var map={
                        table:"gr_pc_vipcard",
                        condition:" id="+user['vipcard_id']+" and balance>0"
                    }
                    M.find(map).then(function(d){
                        if(d.length>0){
                            callback(null,d[0]['balance'],user['login_name']);
                        }else{
                            callback(E.WeiStore.YOU_HAVE_NO_BALANCE);
                        }
                    }).catch(function(err){
                        callback(err);
                    })
                },
                function(balance,login_name,callback){
                    var data={
                        table:"gr_pc_trans",
                        row:{
                            balance:parseFloat(balance),
                            old_uid:old_uid,
                            login_name:login_name,
                            uid:uid,
                            createAt: Math.floor(_.now()/1000),
                            updateAt:Math.floor(_.now()/1000)
                        }
                    }
                    M.create(data).then(function(d){
                        callback(null,d)
                    }).catch(function(err){
                        callback(err)
                    })
                },
                function(arg,callback){
                    var data={
                        table:"gr_pc_user",
                        condition:"id="+old_uid,
                        row:{
                            is_submit:1,
                            uid:uid,
                            updateAt:Math.floor(_.now()/1000)
                        }
                    }
                    M.update(data).then(function(d){
                        callback(null,d)
                    }).catch(function(err){
                        callback(err)
                    })
                }
            ],function(err,result){
                if(err){
                    q.reject(err);
                }else{
                    q.resolve(result)
                }
            });
            return q.promise;
        }
    };
    return M ;
};

