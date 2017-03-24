/*global describe, it, before */
import assert from 'assert';
import net from 'net';
import openport from 'openport';

import TCP from '../src';
import * as protocol from '../src/protocol';
import chunkDecoder from '../src/chunkDecoder';

describe('TCP Transport', function () {
  let transport;
  let port;
  let host = '127.0.0.1';

  before((done) => {
    openport.find(function (err, _port) {
      assert.ifError(err);
      port = _port;
      done();
    });
  });

  describe('Transport', function () {
    it('should create transport instance', function () {
      transport = new TCP({ port, host });
      assert.equal(transport instanceof TCP, true);
    });

    it('should not require new keyword for creation', function () {
      let transport = TCP({ port, host });
      assert.equal(transport instanceof TCP, true);
    });
  });

  describe('Server', function () {
    let server;

    it('should have created server', function () {
      server = new transport.Server();
      assert.equal(server instanceof transport.Server, true);
    });

    it('should return error if server cannot bind to port', function (done) {
      let netServer = net.createServer(() => {
      });

      netServer.listen(port, host, function (err) {
        assert.ifError(err);

        let server = new transport.Server();

        server.listen(function (err) {
          assert.equal(err.errno, 'EADDRINUSE');
          netServer.close(done);
        });
      });
    });

    it('should start server when listen is called', function (done) {
      server.listen(function (err) {
        assert.ifError(err);
        assert.equal(server.server.address().port, port);
        assert.equal(server.listening, true);
        done();
      });
    });

    it('should not try and start another server if listen is called again', function (done) {
      server.listen(function (err) {
        assert.ifError(err);
        done();
      });
    });

    it('should return error if there was a problem stopping server', function (done) {
      // Pull server instance off so we can replace
      // it and restore it later.
      let __server = server.server;

      let _err = 'error oh no';

      server.server = {
        close (cb) {
          cb(_err);
        }
      };

      server.stop(function (err) {
        assert.equal(err, _err);

        // Restore server instance
        server.server = __server;

        done();
      });
    });

    it('should stop server successfully when stop is called', function (done) {
      server.stop(function (err) {
        assert.ifError(err);
        assert.equal(server.server.address(), null);
        assert.equal(server.listening, false);
        done();
      });
    });

    it('should call callback even if not listening when stop is called', function (done) {
      server.stop(function (err) {
        assert.ifError(err);
        done();
      });
    });

    it('should call fn when request is received', function (done) {
      let _method = 'echo';
      let _data = {hello: 'world'};
      let _data2 = {something: 'else'};

      server = new transport.Server(function (method, data, callback) {
        assert.equal(method, _method);
        assert.deepEqual(data, _data);
        callback(null, _data2);
      });

      server.listen(function (err) {
        assert.ifError(err);

        let request = protocol.encode({
          method: _method,
          data: _data,
          id: 1
        });

        let clientSocket = net.createConnection(port, host);
        clientSocket.setEncoding('utf8');
        clientSocket.write(request);

        clientSocket.on('data', chunkDecoder((response) => {
          clientSocket.end();
          assert.ifError(response.error);
          assert.deepEqual(response.data, _data2);
          server.stop(done);
        }));
      });
    });

    it('should handle TCP fragmentation', function (done) {
      let _method = 'echo';
      const MAX_MTU = 65535; // loopback interface MTU
      let _data = '';
      let _data2 = '';
      for (let i = 0; i < MAX_MTU / 2; i++) {
        _data += `A${i}.`;
        _data2 += `B${i}.`;
      }
      _data = Buffer.from(_data);
      _data2 = Buffer.from(_data2);

      server = new transport.Server(function (method, data, callback) {
        assert.equal(method, _method);
        assert.equal(Buffer.compare(data, _data), 0);
        callback(null, _data2);
      });

      server.listen(function (err) {
        assert.ifError(err);

        let request = protocol.encode({
          method: _method,
          data: _data,
          id: 1
        });

        let clientSocket = net.createConnection(port, host);
        clientSocket.write(request);

        clientSocket.on('data', chunkDecoder((response) => {
          clientSocket.end();
          assert.ifError(response.error);
          assert.equal(Buffer.compare(response.data, _data2), 0);
          server.stop(done);
        }));
      });
    });
  });

  describe('Client', function () {
    it('should have created client', function () {
      let client = new transport.Client();
      assert.equal(client instanceof transport.Client, true);
    });

    it('should return error if not connected', function (done) {
      let client = new transport.Client();

      client.call('method', {}, function (err) {
        assert.deepEqual(err.error, 'disconnected');
        done();
      });
    });

    it('should create connection when connect is called', function (done) {
      let netServer = net.createServer(function (socket) {
        socket.end();
        netServer.close(done);
      });

      let client = new transport.Client();

      netServer.listen(port, host, function (err) {
        assert.ifError(err);
        client.connect(function (err) {
          assert.ifError(err);
        });
      });
    });

    it('should be able to call method', function (done) {
      let _method = 'hello';
      let _data = 'world';

      let netServer = net.createServer(function (socket) {
        socket.on('data', chunkDecoder((response) => {
          socket.end(protocol.encode({
            method: response.header.method,
            id: response.header.id,
            data: response.data
          }, null));
        }));
      });

      let client = new transport.Client();

      netServer.listen(port, host, function (err) {
        assert.ifError(err);
        client.connect(function (err) {
          assert.ifError(err);
          client.call(_method, _data, function (err, response) {
            assert.ifError(err);
            assert.deepEqual(response, _data);
            netServer.close(done);
          });
        });
      });
    });

    it('should drop unknown responses from server', function (done) {
      let netServer = net.createServer(function (socket) {
        socket.end(JSON.stringify({
          id: 'invalid',
          error: null,
          data: {}
        }));
      });

      let client = new transport.Client();

      netServer.listen(port, host, function (err) {
        assert.ifError(err);

        client.connect(function (err) {
          assert.ifError(err);

          client.call('', {}, function () {
            assert.fail(null, null, 'should not have called callback');
          });

          setTimeout(function () {
            netServer.close(done);
          }, 50);
        });
      });
    });

    it('should return error if server does', function (done) {
      let _err = 'err!';

      let netServer = net.createServer(function (socket) {
        socket.on('data', chunkDecoder((response) => {
          socket.end(protocol.encode({
            method: response.header.method,
            id: response.header.id,
            data: response.data
          }, _err));
        }));
      });

      let client = new transport.Client();

      netServer.listen(port, host, function (err) {
        assert.ifError(err);

        client.connect(function (err) {
          assert.ifError(err);

          client.call('', {}, function (err) {
            assert.equal(err, _err);

            netServer.close(done);
          });
        });
      });
    });

    it('should disconnect connection when disconnect is called', function (done) {
      let netServer = net.createServer(function (socket) {
        socket.on('end', function () {
          netServer.close(done);
        });
      });

      let client = new transport.Client();

      netServer.listen(port, host, function (err) {
        assert.ifError(err);
        client.connect(function (err) {
          assert.ifError(err);
          client.disconnect(function (err) {
            assert.ifError(err);
          });
        });
      });
    });

    it('should call disconnect callback even if not connected', function (done) {
      let client = new transport.Client();

      client.disconnect(function (err) {
        assert.ifError(err);
        done();
      });
    });
  });
});
