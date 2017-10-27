const sidecarServer = require('./forensic/sidecarServer')
const hapi = require('hapi')
const joi = require('joi')
const server = new hapi.Server()
const request = require('request')
const ILP = require('ilp')
const Packet = require('ilp-packet')
const config = require('rc')('ut_dfsp_api_dev', {
  cluster: 'dfsp1-test'
})
server.connection({ port: 8021 })

function directoryFailActionHandler (request, reply, source, error) {
  return reply({
    'jsonrpc': '2.0',
    'id': '',
    'error': {
      'type': 'parsingerror',
      'code': 400,
      'errorPrint': 'The request could not be read by our software.',
      'message': 'Parsing error'
    },
    'debug': {
      'cause': {
        'error': {
          'code': 400,
          'message': 'An application generated message related to the error',
          'errorPrint': 'This is the exception message from the top level exception',
          'type': 'parsingerror'
        }
      },
      'stackInfo': []
    }
  })
}

server.route([
  {
    path: '/resources',
    method: 'get',
    handler: (req, reply) => {
      request({
        url: 'http://localhost:8010/receivers/' + req.query.identifier.split(':').pop(),
        method: 'GET',
        json: true,
        headers: {
          Authorization: 'Basic ' + new Buffer(config.cluster + ':' + config.cluster).toString('base64')
        }
      }, function (error, message, response) {
        return reply({
          dfsp_details: message.body,
          fraud_details: {
            id: 'dc42027a-527d-4fdc-900b-be91af7e7e2c',
            createdDate: '2017-07-10T10:00:35.826Z',
            score: 83
          },
          directory_details: [
            {
              name: 'The first DFSP',
              providerUrl: 'http://localhost:8010',
              shortName: 'dsfp1',
              primary: false,
              registered: message.statusCode < 400
            },
            {
              name: 'The second DFSP',
              providerUrl: 'http://localhost:8010',
              shortName: 'dsfp2',
              primary: true,
              registered: message.statusCode < 400
            }
          ]
        })
      })
    },
    config: {
      validate: {
        query: joi.object().keys({
          identifier: joi.string().required()
        }),
        failAction: (request, reply, source, error) => {
          return reply({
            'message': 'Bad request'
          }).code(400)
        }
      }
    }
  },
  {
    path: '/directory/user/get',
    method: 'post',
    handler: (request, reply) => {
      if (request.payload.params.userURI === 'number:fail') {
        return reply({
          'message': 'Account not found for userURI=' + request.payload.params.userURI
        }).code(400)
      }
      return reply({
        'jsonrpc': '2.0',
        'id': request.payload.id,
        'result': {
          'name': 'Chris Griffin',
          'account': 'http://receivingdfsp.com/' + request.payload.params.userURI.split(':').pop(),
          'currency': 'TZS',
          // Should be implemented by modusBox to return the DFSP address too
          'dfsp': 'http://localhost:8010'
        }
      })
    },
    config: {
      validate: {
        payload: joi.object({
          'jsonrpc': joi.string().valid('2.0'),
          'id': joi.string().required(),
          'method': joi.string().required(),
          'params': joi.object({
            'userURI': joi.string().required()
          }).required()
        }),
        failAction: directoryFailActionHandler
      }
    }
  },
  {
    path: '/resources',
    method: 'post',
    handler: (request, reply) => {
      return reply({
        'name': 'The First DFSP',
        'providerUrl': 'http://localhost:8010',
        'shortName': 'dsfp1',
        'primary': 'true',
        'registered': 'true'
      })
    },
    config: {
      validate: {
        payload: joi.object().keys({
          identifier: joi.string().required(),
          primary: joi.boolean()
        }),
        failAction: directoryFailActionHandler
      }
    }
  },
  {
    path: '/spspclient/invoices',
    method: 'get',
    handler: (req, reply) => {
      if (!req.query.invoiceUrl) {
        return reply({
          'id': 'BadRequest',
          'message': 'invoiceUrl query string parameter is required'
        }).code(400)
      }
      var receiver = req.query.invoiceUrl.split('/').pop()
      if (receiver === 'fail') {
        return reply({
          'id': 'Error',
          'message': 'Error getting receiver details, receiver responded with: undefined getaddrinfo ENOTFOUND ' + receiver + ' ' + receiver + ':80',
          'debug': {}
        })
      }
      request({
        url: req.query.invoiceUrl,
        method: 'GET',
        json: true,
        headers: {
          Authorization: 'Basic ' + new Buffer(config.cluster + ':' + config.cluster).toString('base64')
        }
      }, function (error, message, response) {
        if (message.statusCode >= 400) {
          error = response.message
        }
        if (error) {
          return reply({
            'message': error
          }).code(400)
        }
        return reply(response)
      })
    }
  },
  {
    path: '/spspclient/receivers/{receiver}',
    method: 'get',
    handler: (req, reply) => {
      if (req.params.receiver === 'fail') {
        return reply({
          'id': 'Error',
          'message': 'Error getting receiver details, receiver responded with: undefined getaddrinfo ENOTFOUND ' + req.params.receiver + ' ' + req.params.receiver + ':80',
          'debug': {}
        })
      }
      request({
        url: 'http://localhost:8010/receivers/' + req.params.receiver,
        method: 'GET',
        json: true,
        headers: {
          Authorization: 'Basic ' + new Buffer(config.cluster + ':' + config.cluster).toString('base64')
        }
      }, function (error, message, response) {
        if (message.statusCode >= 400) {
          error = response.message
        }
        if (error) {
          return reply({
            'message': error
          }).code(400)
        }
        return reply(response)
      })
    }
  },
  {
    path: '/spspclient/quoteSourceAmount',
    method: 'get',
    handler: (request, reply) => {
      var identifier = request.query.identifier
      var identifierType = request.query.identifierType
      var sourceAmount = request.query.sourceAmount

      if (!sourceAmount) {
        return reply({
          'id': 'BadRequest',
          'message': 'sourceAmount query string parameter is required'
        })
      }
      if (!identifierType) {
        return reply({
          'id': 'BadRequest',
          'message': 'identifierType query string parameter is required'
        })
      }
      if (!identifier) {
        return reply({
          'error': {
            'id': 'Bad request',
            'message': 'Failed to process request for interopID=2b39b6ab-8a9f-4a8d-9257-9ca2d73c2561: Required query parameter identifier not specified'
          },
          'debug': {}
        })
      }
      return reply({
        'destinationAmount': sourceAmount * 0.975
      })
    }
  },
  {
    path: '/spspclient/quoteDestinationAmount',
    method: 'get',
    handler: (request, reply) => {
      var identifier = request.query.identifier
      var identifierType = request.query.identifierType
      var destinationAmount = request.query.destinationAmount

      if (!destinationAmount) {
        return reply({
          'id': 'BadRequest',
          'message': 'destinationAmount query string parameter is required'
        })
      }
      if (!identifierType) {
        return reply({
          'id': 'BadRequest',
          'message': 'identifierType query string parameter is required'
        })
      }
      if (!identifier) {
        return reply({
          'error': {
            'id': 'Bad request',
            'message': 'Failed to process request for interopID=2b39b6ab-8a9f-4a8d-9257-9ca2d73c2561: Required query parameter identifier not specified'
          },
          'debug': {}
        })
      }
      return reply({
        'sourceAmount': destinationAmount * 1.025
      })
    }
  },
  {
    path: '/spspclient/payments',
    method: 'put',
    handler: (req, reply) => {
      var ipr = ILP.PSK.parsePacketAndDetails({ packet: ILP.IPR.decodeIPR(Buffer.from(req.payload.ipr, 'base64')).packet })
      var receiver = ipr.account.substr(0, ipr.account.lastIndexOf('.'))
      if (receiver.indexOf('fail') !== -1) {
        return reply({
          'id': 'Error',
          'message': 'Error getting receiver details, receiver responded with: 500 Internal Server Error',
          'debug': {}
        })
      }

      request({
        url: receiver,
        method: 'GET',
        json: true,
        headers: {
          Authorization: 'Basic ' + new Buffer(config.cluster + ':' + config.cluster).toString('base64')
        }
      }, function (error, message, response) {
        if (message.statusCode >= 400) {
          error = response.message
        }
        if (error) {
          return reply({
            'message': error
          }).code(400)
        }
        request({
          url: 'http://localhost:8014/ledger/transfers/' + ipr.publicHeaders['payment-id'],
          method: 'PUT',
          json: {
            'id': 'http://localhost:8014/ledger/transfers/' + ipr.publicHeaders['payment-id'],
            'ledger': 'http://localhost:8014/ledger',
            'debits': [
              {
                'account': req.payload.sourceAccount,
                'amount': Number(ipr.amount) / 100,
                'memo': {},
                'authorized': true
              }
            ],
            'credits': [
              {
                'account': response.id,
                'memo': {
                  ilp: Packet.serializeIlpPayment({
                    account: receiver,
                    amount: '' + (ipr.amount / 100),
                    data: ILP.PSK.createDetails({
                      publicHeaders: { 'Payment-Id': ipr.publicHeaders['payment-id'] },
                      headers: {
                        'Content-Length': JSON.stringify(req.payload.memo ? req.payload.memo : '').length,
                        'Content-Type': 'application/json',
                        'Sender-Identifier': req.payload.sourceIdentifier
                      },
                      disableEncryption: true,
                      data: Buffer.from(JSON.stringify(req.payload.memo ? req.payload.memo : ''))
                    })
                  }).toString('base64')
                },
                'amount': Number(ipr.amount) / 100
              }
            ],
            'execution_condition': 'ni:///sha-256;47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU?fpt=preimage-sha-256&cost=0',
            'cancellation_condition': null,
            'expires_at': new Date(ipr.headers['expires-at'])
          }
        }, function (error, message, response) {
          if (message.statusCode >= 400) {
            error = response.message
          }
          if (error) {
            return reply({
              'message': error
            }).code(400)
          }

          request({
            url: 'http://localhost:8010/payments/' + ipr.publicHeaders['payment-id'],
            method: 'PUT',
            json: {
              paymentId: ipr.publicHeaders['payment-id'],
              destinationAmount: '' + Number(ipr.amount) / 100,
              data: ipr.data.toString(),
              status: 'prepared'
            },
            headers: {
              Authorization: 'Basic ' + new Buffer(config.cluster + ':' + config.cluster).toString('base64')
            }
          }, function (error, message, response) {
            request({
              url: 'http://localhost:8014/ledger/transfers/' + ipr.publicHeaders['payment-id'] + '/fulfillment',
              method: 'PUT',
              body: 'oAKAAA',
              headers: { 'Content-type': 'text/plain' }
            }, function (error, message, response) {
              if (message.statusCode >= 400) {
                error = response.message
              }
              if (error) {
                return reply({
                  'message': error
                }).code(400)
              }

              return reply({
                'paymentId': ipr.publicHeaders['payment-id'],
                'connectorAccount': req.payload.connectorAccount,
                'fulfillment': 'oCKAINnWMdlw8Vpvz8jMBdIOguJls1lMo6kBT6ERSrh11MDK',
                'status': 'executed'
              })
            })
          })
        })
      })
    },
    config: {
      validate: {
        payload: joi.object({
          'sourceAccount': joi.string().required(),
          'sourceAmount': joi.number().required(),
          'ipr': joi.string().required(),
          'sourceExpiryDuration': joi.number().required(),
          'connectorAccount': joi.string().required()
        }),
        failAction: directoryFailActionHandler
      }
    }
  },
  {
    path: '/spspclient/invoices',
    method: 'post',
    handler: (req, reply) => {
      request({
        url: 'http://localhost:8010/invoices',
        method: 'post',
        headers: {
          Authorization: 'Basic ' + new Buffer(config.cluster + ':' + config.cluster).toString('base64')
        },
        json: {
          invoiceUrl: 'http://localhost:8010/invoices/' + req.payload.invoiceId,
          memo: req.payload.memo,
          senderIdentifier: req.payload.senderIdentifier
        }
      }, function (error, message, response) {
        if (message.statusCode >= 400) {
          error = response.message
        }
        if (error) {
          return reply({
            'message': error
          }).code(400)
        }
        reply(response)
      })
    },
    config: {
      validate: {
        payload: joi.object({
          'invoiceId': joi.string().required(),
          'memo': joi.string().required(),
          'submissionUrl': joi.string().required(),
          'senderIdentifier': joi.string().required()
        })
      }
    }
  },
  {
    path: '/spspclient/quotes',
    method: 'post',
    handler: (req, reply) => {
      delete req.payload.payee.url
      request({
        url: 'http://localhost:8010/quotes',
        method: 'post',
        headers: {
          Authorization: 'Basic ' + new Buffer(config.cluster + ':' + config.cluster).toString('base64')
        },
        json: req.payload
      }, function (error, message, response) {
        if (message.statusCode >= 400) {
          error = response.message
        }
        if (error) {
          return reply({
            'message': error
          }).code(400)
        }
        response.receiveAmount = {
          amount: req.payload.amount.amount,
          currency: req.payload.amount.currency
        }
        response.sourceExpiryDuration = 10
        response.ipr = (ILP.IPR.createIPR({
          receiverSecret: Buffer.from('', 'base64'),
          destinationAmount: (Number(req.payload.amount.amount) * 100).toFixed(0),
          destinationAccount: req.payload.payee.account,
          publicHeaders: { 'Payment-Id': req.payload.paymentId },
          disableEncryption: true,
          expiresAt: new Date((new Date()).getTime() + 10 * 60000),
          data: Buffer.from(JSON.stringify(response.data))
        })).toString('base64')
        reply(response)
      })
    },
    config: {
      validate: {
        payload: joi.object().keys({
          paymentId: joi.string().required().regex(/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/).example('3a2a1d9e-8640-4d2d-b06c-84f2cd613300').description('The UUID for the local transfer'),
          payer: joi.object().keys({
            identifier: joi.string().required().example('92806391'),
            identifierType: joi.string().required().example('eur')
          }).required(),
          payee: joi.object().keys({
            url: joi.string().required().example('http://localhost:8020/quotes'),
            account: joi.string().required().example('http://host/ledger/account/alice'),
            identifier: joi.string().required().example('30754016'),
            identifierType: joi.string().required().example('eur')
          }).required(),
          transferType: joi.string().required().example('p2p'),
          amountType: joi.string().required().valid(['SEND', 'RECEIVE']).example('SEND'),
          amount: joi.object().keys({
            amount: joi.string().example('10'),
            currency: joi.string().example('TZS')
          }).required(),
          fees: joi.object().keys({
            amount: joi.string().example('0.25'),
            currency: joi.string().example('TZS')
          }).optional()
        }).unknown().required()
      }
    }
  }
])

module.exports = new Promise(function (resolve, reject) {
  server.start((err) => {
    if (err) {
      reject(err)
    } else {
      resolve(true)
    }
  })
})
.then(() => {
  return {
    stop: function () {
      return Promise.resolve(server.stop())
        .then(() => {
          return sidecarServer
        })
        .then((methods) => {
          return methods.stop()
        })
    }
  }
})
