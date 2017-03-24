import net from 'net';
import crypto from 'crypto';
import {encode} from './protocol';
import chunkDecoder from './chunkDecoder';

function TCPTransportServer (config) {
  let _TCPTransportServer = function (fn) {
    this.server = net.createServer(function (c) {
      c.on('data', chunkDecoder((request) => {
        fn(request.header.method, request.data, function (error, d) {
          const response = encode({
            method: request.header.method,
            id: request.header.id,
            data: d
          }, error);
          c.write(response);
        });
      }));
    });
  };

  _TCPTransportServer.prototype.listen = function (done) {
    if (this.listening) {
      return done();
    }

    this.server.once('error', function (err) {
      return done(err);
    });

    this.server.listen(config.port, config.host, () => {
      this.listening = true;
      done();
    });
  };

  _TCPTransportServer.prototype.stop = function (done) {
    if (!this.listening) {
      return done();
    }
    this.server.close((err) => {
      if (err) {
        return done(err);
      }
      this.listening = false;
      done();
    });
  };

  return _TCPTransportServer;
}

function TCPTransportClient (config) {
  let _TCPTransportClient = function () {
    this.fns = {};
  };

  _TCPTransportClient.prototype.connect = function (done) {
    // open a persistent connection to the server
    this.conn = net.createConnection(config.port, config.host);
    // this.conn.setEncoding(null);
    this.conn.on('connect', () => {
      this.connected = true;
      done();
    });

    this.conn.on('data', chunkDecoder((d) => {
      let fn = this.fns[d.header.id];
      if (!fn) {
        // unknown, drop
        return;
      }
      if (d.header.error) {
        return fn(d.header.error);
      } else {
        return fn(null, d.data);
      }
    }));
  };

  _TCPTransportClient.prototype.disconnect = function (done) {
    if (!this.connected) {
      return done();
    }
    this.conn.end();
    this.connected = false;
    done();
  };

  _TCPTransportClient.prototype.call = function (method, data, callback) {
    if (!this.connected) {
      return callback({
        error: 'disconnected'
      });
    }
    const id = crypto.randomBytes(10).toString('hex');
    const request = encode({
      method,
      id,
      data
    });

    // stash callback for later
    this.fns[id] = callback;
    this.conn.write(request);
  };

  return _TCPTransportClient;
}

function TCPTransport (config) {
  if (!(this instanceof TCPTransport)) {
    return new TCPTransport(config);
  }
  this.Server = TCPTransportServer(config);
  this.Client = TCPTransportClient(config);
}

export default TCPTransport;
