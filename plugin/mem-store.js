/* Copyright (c) 2010-2013 Richard Rodger */

"use strict"


var store   = require('./store')

var _       = require('underscore')
var idgen   = require('idgen')
var uuid    = require('node-uuid')



function MemStore() {
  var self   = new store.Store()
  var parent = self.parent()

  self.name = 'mem-store'

  var mark = idgen(4)


  var si
  var opts
  var entmap = {}


  var list = function(qent,q,cb) {
    var list = []

    var canon = qent.canon$({object:true})
    var base = canon.base
    var name = canon.name

    var entset = entmap[base] ? entmap[base][name] : null ;
    
    if( entset ) {
      _.keys(entset).forEach(function(id){
        var ent = entset[id]
        
        for(var p in q) {
          if( q[p] != ent[p] ) {
            return
          }
        }

        list.push(ent)
      })
    }

    cb(null,list)
  }
  

  self.save$ = function(args,cb){
    var ent = args.ent

    if( !ent.id ) {
      ent.id = uuid()
      if( opts.idlen ) {
        ent.id = ent.id.substring(0,opts.idlen)
      }
    }
    
    var canon = ent.canon$({object:true})
    var base   = canon.base
    var name   = canon.name
    
    entmap[base] = entmap[base] || {};
    entmap[base][name] = entmap[base][name] || {};

    entmap[base][name][ent.id] = ent;
    
    si.log.debug(args.tag$,'save',ent,mark)
    cb(null,ent);
  }


  self.load$ = function(args,cb){
    var qent = args.qent
    var q    = args.q

    list(qent,q,function(err,list){
      si.log.debug(args.tag$,'load',list[0],mark)
      cb(err, list[0] || null);
    })
  }


  self.list$ = function(args,cb){
    var qent = args.qent
    var q    = args.q

    list(qent,q,function(err,list){
      si.log.debug(args.tag$,'list',list.length,list[0])
      cb(err, list);
    })
  }


  self.remove$ = function(args,cb){
    var qent = args.qent
    var q    = args.q

    var all  = q.all$ // default false
    delete q.all$

    var load  = _.isUndefined(q.load$) ? true : q.load$ // default true 
    delete q.load$
  
    
    list(qent,q,function(err,list){
      if( err ) {
        cb(err)
      }
      else {
        if( !all ) {
          list = list.slice(0,1)
        }

        list.forEach(function(ent){
          var canon = qent.canon$({object:true})
          
          delete entmap[canon.base][canon.name][ent.id]
          si.log.debug(args.tag$,'remove',ent)
        })

        if( !load ) {
          list = []
        }

        cb(null,list)
      }
    })
  }


  self.close$ = function(args,cb){
    si.log.debug(args.tag$,'close')
    cb()
  }



  self.init = function(seneca,options,cb) {
    si = seneca
    opts = _.extend({
      idlen:6
    },options)

    parent.init(si,opts,function(err,canondesc){
      if( err ) return cb(err);
      mark = canondesc+'~'+mark

      si.add({role:self.name,cmd:'dump'},function(args,cb){
        cb(null,entmap)
      })

      cb()
    })
  }


  return self
}

exports.plugin = function() {
  return new MemStore()
}
