/* Copyright (c) 2017 Richard Rodger, MIT License */
'use strict'

var Lab = require('lab')
var Code = require('code')
var Hoek = require('hoek')
var Seneca = require('..')

var lab = (exports.lab = Lab.script())
var describe = lab.describe
var it = lab.it
var expect = Code.expect

var Transports = require('./stubs/transports.js')

var parents = meta => meta.parents.map(x => x[0])

var partial_match = (obj, pat) => Hoek.contain(obj, pat, { deep: true })

describe('message', function() {
  it('happy-vanilla', function(fin) {
    Seneca({ tag: 'h0' })
      .test(fin)
      .add('a:1', function a1(msg, reply) {
        expect(parents(msg.meta$)).equal([])

        var m1 = {x1: 1}
        this.act('a:2', m1, reply)
      })
      .add('a:2', function a2(msg, reply) {
        expect(parents(msg.meta$)).equal(['a:1'])
        expect(msg.x1).equal(1)

        var m2 = {x2: 2}
        this.act('a:3', m2, reply)
      })
      .add('a:3', function a3(msg, reply) {
        expect(parents(msg.meta$)).equal(['a:2', 'a:1'])
        expect(msg.x2).equal(2)

        var m3 = {x3: 3}
        this.act('a:4', m3, reply)
      })
      .add('a:4', function a4(msg, reply) {
        expect(parents(msg.meta$)).equal(['a:3', 'a:2', 'a:1'])
        expect(msg.x3).equal(3)

        var m4 = {x4: msg.x}
        reply(m4)
      })
      .act('a:1,x:1', function(err, out, meta) {
        expect(
          this.util.flatten(meta.trace, 'trace').map(x => x.desc[0])
        ).equal(['a:2', 'a:3', 'a:4'])
        fin()
      })
  })


  it('happy-msg', function(fin) {
    Seneca({ tag: 'h0' })
      .test(fin)
      .add('a:1', function a1(msg, reply) {
        expect(parents(msg.meta$)).equal([])

        msg.x1 = msg.x
        this.act('a:2', msg, reply)
      })
      .add('a:2', function a2(msg, reply) {
        expect(parents(msg.meta$)).equal(['a:1'])
        expect(msg.x1).equal(msg.x)

        msg.x2 = msg.x
        this.act('a:3', msg, reply)
      })
      .add('a:3', function a3(msg, reply) {
        expect(parents(msg.meta$)).equal(['a:2', 'a:1'])
        expect(msg.x2).equal(msg.x)

        msg.x3 = msg.x
        this.act('a:4', msg, reply)
      })
      .add('a:4', function a4(msg, reply) {
        expect(parents(msg.meta$)).equal(['a:3', 'a:2', 'a:1'])
        expect(msg.x3).equal(msg.x)

        msg.x4 = msg.x
        reply(msg)
      })
      .act('a:1,x:1', function(err, out, meta) {
        expect(
          this.util.flatten(meta.trace, 'trace').map(x => x.desc[0])
        ).equal(['a:2', 'a:3', 'a:4'])
        fin()
      })
  })


  it('loop', function(fin) {
    var i = 0
    Seneca({ id$: 'loop', idlen: 4, log: 'silent', limits: { maxparents: 3 } })
      .add('a:1', function a1(msg, reply) {
        i++
        if (4 < i) {
          throw new Error('failed to catch loop i=' + i)
        }
        this.act('a:1', msg, reply)
      })
      .act('a:1', function(err, out) {
        expect(i).equal(4)
        expect(err.code).equal('maxparents')
        fin()
      })
  })

  it('branch', function(fin) {
    var log = []
    Seneca({ id$: 'branch', idlen: 4, limits: { maxparents: 3 } })
      .test(fin)
      .add('a:1', function a1(msg, reply) {
        log.push('a1')
        expect(msg.meta$.parents.map(x => x[0])).equal([])
        msg.a1 = 1
        this.act('b:1,a:null', msg)
        this.act('a:2', msg, reply)
        //this.act('b:1,a:null', {a1:1})
        //this.act('a:2', {a1:1}, reply)
      })
      .add('a:2', function a2(msg, reply) {
        expect(msg.meta$.parents.map(x => x[0])).equal(['a:1'])
        log.push('a2')

        //msg.a2 = 1
        //this.act('c:1,a:null', msg)
        //this.act('a:3', msg, function(err, out) {

        this.act('c:1,a:null', {a2:1})
        this.act('a:3', {a2:1}, function(err, out, meta) {
          expect(
            partial_match(meta.trace, [
              {
                desc: ['a:4'],
                trace: []
              }
            ])
          ).true()

          log.push('a2r')
          //msg.a2r = 1
          this.act('c:2,a:null', {a2:1, a2r:1})

          // capture c2
          setImmediate(reply.bind(null, err, out))
        })
      })
      .add('a:3', function a3(msg, reply) {
        expect(msg.meta$.parents.map(x => x[0])).equal(['a:2', 'a:1'])
        log.push('a3')
        //msg.a3 = 1
        this.act('a:4', {a3:1}, reply)
      })
      .add('a:4', function a3(msg, reply) {
        expect(msg.meta$.parents.map(x => x[0])).equal(['a:3', 'a:2', 'a:1'])
        log.push('a4')
        //msg.a4 = 1
        reply({a4:1})
      })
      .add('b:1', function b1(msg, reply) {
        expect(msg.meta$.parents.map(x => x[0])).equal(['a:1'])
        log.push('b1')
        //msg.b1 = 1
        reply()
      })
      .add('c:1', function c1(msg, reply) {
        expect(msg.meta$.parents.map(x => x[0])).equal(['a:2', 'a:1'])
        log.push('c1')
        //msg.c1 = 1
        reply()
      })
      .add('c:2', function c2(msg, reply) {
        expect(msg.meta$.parents.map(x => x[0])).equal(['a:3', 'a:2', 'a:1'])
        log.push('c2')
        //msg.c2 = 1
        reply()
      })
      .act('a:1', function(err, out, meta) {
        expect(err).equal(null)
        //expect(out).equal({ a: 4, a1: 1, a2: 1, a3: 1, a4: 1 })
        expect(out).includes({ a4: 1 })
        expect(log).equal(['a1', 'b1', 'a2', 'c1', 'a3', 'a4', 'a2r', 'c2'])

        expect(
          partial_match(meta.trace, [
            { desc: ['b:1'] },
            {
              desc: ['a:2'],
              trace: [
                { desc: ['c:1'] },
                {
                  desc: ['a:3'],
                  trace: [{ desc: ['a:4'] }, { desc: ['c:2'] }]
                }
              ]
            }
          ])
        ).true()

        fin()
      })
  })

  it('custom', function(fin) {
    var si = Seneca()
      .test(fin)
      .add('a:1', function a1(msg, reply) {
        msg.meta$.custom.a1 = 1
        reply({ x: 1 })
      })
      .add('a:2', function a2(msg, reply) {
        msg.meta$.custom.a2 = 1
        msg.x = 2
        reply(msg)
      })

    var foo = { y: 1 }
    var bar = { z: 1 }

    si
      .gate()
      .act({ a: 1, custom$: foo }, function(err, out, meta) {
        expect(err).equal(null)
        expect(out).includes({ x: 1 })
        expect(foo).equal({ y: 1, a1: 1 })
        expect(meta.custom).equal({ y: 1, a1: 1 })
      })
      .act({ a: 2, custom$: bar }, function(err, out, meta) {
        expect(err).equal(null)
        expect(out).includes({ a: 2, x: 2 })
        expect(bar).equal({ z: 1, a2: 1 })
        expect(meta.custom).equal({ z: 1, a2: 1 })
        fin()
      })
  })

/*
  it('proto', function(fin) {
    var si = Seneca()
      .test(fin)
      .add('a:1', function a1(msg, reply) {
        expect(msg.a).equal(1)
        expect(msg.y).equal(1)
        reply({ x: 1 })
      })
      .add('a:2', function a2(msg, reply) {
        expect(msg.a).equal(2)
        expect(msg.z).equal(1)
        msg.x = 2
        reply(msg)
      })

    var foo = { y: 1 }
    var bar = { z: 1 }

    var m0 = Object.create(foo)
    m0.a = 1

    var m1 = { a: 2 }
    m1.__proto__ = bar

    //var cm1 = Seneca.util.clean(m1)
    //console.log(cm1,cm1.z)

    si
      .gate()
      .act(m0, function(err, out) {
        expect(err).equal(null)
        expect(out).includes({ x: 1 })
      })
      .act(m1, function(err, out) {
        expect(err).equal(null)
        expect(out.x).equal(2)
        expect(out.z).equal(1)
        fin()
      })
  })
*/

  it('empty-response', function(fin) {
    var si = Seneca()
      .test(fin)
      .add('a:1', function a1(msg, reply) {
        reply()
      })
      .add('b:1', function b1(msg, reply) {
        this.act('a:1', reply)
      })
      .add('c:1', function c1(msg, reply) {
        this.prior(msg, reply)
      })
      .add('d:1', function d1a(msg, reply) {
        reply()
      })
      .add('d:1', function d1b(msg, reply) {
        this.prior(msg, reply)
      })
      .act('a:1', function(err, out, meta) {
        expect(err).not.exist()
        expect(out).not.exist()
        expect(meta.pattern).equal('a:1')
      })
      .act('b:1', function(err, out, meta) {
        expect(err).not.exist()
        expect(out).not.exist()
        expect(meta.pattern).equal('b:1')
        expect(meta.trace[0].desc[0]).equal('a:1')
      })
      .act('c:1', function(err, out, meta) {
        expect(err).not.exist()
        expect(out).not.exist()
        expect(meta.pattern).equal('c:1')
      })
      .act('d:1', function(err, out, meta) {
        expect(err).not.exist()
        expect(out).not.exist()
        expect(meta.pattern).equal('d:1')
        expect(meta.trace[0].desc[0]).equal('d:1')
      })
      .ready(fin)
  })


  it('reply', function(fin) {
    Seneca()
      .test(fin)
      .add('a:1', function a1(msg, reply) {
        reply({ x: 1 })
      })
      .add('b:1', function b1(msg, reply) {
        msg.x = 2
        reply(msg)
      })
      .gate()
      .act('a:1', function(err, out, meta) {
        //console.log('a1', err, this.util.clean(out), meta)
        expect(meta.pattern).equal('a:1')
        expect(meta.action).match(/a1/)
      })
      .act('b:1', function(err, out, meta) {
        //console.log('b1', err, this.util.clean(out), meta)
        expect(meta.pattern).equal('b:1')
        expect(meta.action).match(/b1/)
      })
      .ready(fin)
  })


  it('prior', function(fin) {
    Seneca()
      .test(fin)
      .add('a:1', function a1(msg, reply) {
        //console.log('a1', msg.meta$)
        reply({ x: 1 })
      })
      .add('a:1', function a1p(msg, reply) {
        //console.log('a1p', msg.meta$)
        this.prior(msg, reply)
      })
      .add('b:1', function b1(msg, reply) {
        this.prior(msg, reply)
      })
      .gate()
      .act('b:1', function(err, out, meta) {
        //console.log('b1', err, out, meta)
        expect(meta.pattern).equal('b:1')
        expect(meta.action).match(/b1/)
      })

      .act('a:1', function(err, out, meta) {
        //console.log('out a1', err, this.util.clean(out), meta)

        expect(err).not.exist()
        expect(out.x).equal(1)
        expect(meta.pattern).equal('a:1')
        expect(meta.trace[0].desc[0]).equal('a:1')
      })
    .ready(fin)
  })

  it('entity', function(fin) {
    var si = Seneca().test(fin).use('entity')

    si = si.gate()

    var foo = si.make$('foo', { id$: 'a', a: 1 })

    foo.save$(function(err, out, meta) {
      expect(out.toString()).equal('$-/-/foo;id=a;{a:1}')
      expect(meta).exist()
      expect(out.canon$).exist()
    })

    foo.list$(function(err, list, meta) {
      expect(list.length).equal(1)
      expect(meta).exist()

      var foo0 = list[0]
      expect(foo0.toString()).equal('$-/-/foo;id=a;{a:1}')
      expect(foo0.canon$).exist()

      fin()
    })
  })

  it('simple-transport', function(fin) {
    var st = Transports.make_simple_transport()

    var s0 = Seneca({ id$: 's0', log: 'silent', legacy: { transport: false } })
      .test(function(err, meta) {
        //console.log('s0 TEST',meta)
        if (
          'a3err' === err.message ||
          'a33throw' === err.message ||
          't4' === (meta && meta.tx)
        )
          return
        else fin(err)
      }, 'silent')
      .use(st)
      .listen({ type: 'simple' })
    s0.id = 's0'

    var c0 = Seneca({ id$: 'c0', log: 'silent', legacy: { transport: false } })
      .test(function(err, meta) {
        //console.dir(meta)
        if (
          'a3err' === err.message ||
          'a33throw' === err.message ||
          't4' === (meta && meta.tx)
        )
          return
        else fin(err)
      }, 'silent')
      .use(st)
      .client({ type: 'simple' })
    c0.id = 'c0'

    s0.add('a:1', function a1(msg, reply) {
      reply()
    })

    s0.add('a:2', function a2(msg, reply) {
      reply({ x: 2 })
    })

    s0.add('a:3', function a3(msg, reply) {
      reply(new Error('a3err'))
    })

    s0.add('a:33', function a3(msg, reply) {
      throw new Error('a33throw')
    })

    s0.add('a:4', function a4(msg, reply) {
      reply({ x: msg.x })
    })
    s0.add('a:4', function a4(msg, reply) {
      this.prior({ x: 4 }, reply)
    })

    s0.ready(function() {
      c0.ready(function() {
        c0
          .add('b:1', function b1(msg, reply) {
            this.act({ id$: 'b1/' + msg.meta$.tx, x: msg.x }, reply)
          })
/*
          .act('a:1,id$:m0/t0', function(err, out, meta) {
            expect(err).not.exist()
            expect(out).not.exist()
            expect(meta.id).equal('m0/t0')
            expect(meta.pattern).equal('') // catchall pin
          })
          .act('a:2,id$:m1/t1', function(err, out, meta) {
            //console.dir(meta,{depth:null})
            expect(err).not.exist()
            expect(out.x).equal(2)
            expect(meta.id).equal('m1/t1')
            expect(meta.trace[0].desc[0]).equal('a:2')
            expect(meta.pattern).equal('') // catchall pin
            expect(meta.instance).equal('c0')
          })

          .act('a:3,id$:m2/t2', function(err, out, meta) {
            //console.log(err,'OUT',out,'META',meta)

            expect(out).equal(null)
            expect(err.message).to.equal('a3err')
            
            expect(meta.err.code).equal('act_execute')
            expect(meta.id).equal('m2/t2')

            //expect(meta.pattern).equal('') // catchall pin
            //expect(meta.instance).equal('c0')
            //expect(meta.trace[0].desc[0]).equal('a:3')
            //expect(meta.trace[0].desc[1]).equal('m2/t2')
            //expect(meta.trace[0].desc[2]).equal('s0')
          })


          .act('a:33,id$:m33/t33', function(err, out, meta) {
            expect(out).equal(null)
            expect(err.message).to.equal('a33throw')
            expect(meta.id).equal('m33/t33')

            //expect(meta.pattern).equal('') // catchall pin
            //expect(meta.instance).equal('c0')
            //expect(meta.err.code).equal('act_execute')
            //expect(meta.trace[0].desc[0]).equal('a:33')
            //expect(meta.trace[0].desc[1]).equal('m33/t33')
            //expect(meta.trace[0].desc[2]).equal('s0')
          })

          .act('a:4,id$:m3/t3', function(err, out, meta) {
            //console.dir(meta,{depth:null})

            expect(err).equal(null)
            expect(out.x).equal(4)
            expect(meta.id).equal('m3/t3')
            expect(meta.pattern).equal('') // catchall pin
            expect(meta.instance).equal('c0')

            expect(meta.trace[0].desc[0]).equal('a:4')
            expect(meta.trace[0].trace[0].desc[0]).equal('a:4')
          })


*/
          .act('b:1,id$:m4/t4', function(err, out, meta) {
            expect(out).equal(null)
            expect(err).exists()
            //console.dir(err,{depth:null})

            expect(err.message).to.match(/seneca/)

            //expect(meta.id).equal('m4/t4')
            //expect(meta.pattern).equal('b:1')
            //expect(meta.instance).equal('c0')
            //expect(err.code).equal('act_not_found')
            //expect(meta.trace[0].desc[1]).equal('b1/t4')
            //expect(meta.trace[0].trace[0].desc[1]).equal('b1/t4')

          })

          .ready(function() {
            s0.close(c0.close.bind(c0, fin))
          })
      })
    })
  })
})
