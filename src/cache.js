import { EventEmitter } from 'events';
import md5 from 'crypto-js/md5';
import { ScolaError } from '@scola/error';

export default class Cache extends EventEmitter {
  constructor() {
    super();

    this._model = null;
    this._storage = null;
    this._index = null;

    this._handleError = (e) => this._error(e);
    this._handlePublish = () => this._publish();
    this._handleSet = () => this._set();
    this._handleSelect = (d, t, e) => this._select(d, t, e);
  }

  destroy() {
    this._unbindModel();
    this._destroy(true);

    this._model = null;
    this._storage = null;
  }

  model(value = null) {
    if (value === null) {
      return this._model;
    }

    this._model = value;
    this._bindModel();

    return this;
  }

  storage(value = null) {
    if (value === null) {
      return this._storage;
    }

    this._storage = value;
    return this;
  }

  load() {
    const syncValue = this._getItem(this._modelKey(), (error, value) => {
      this._loadGet(error, value);
    });

    if (syncValue instanceof Promise) {
      return this;
    }

    this._loadGet(null, syncValue);
    return this;
  }

  select() {
    const key = this._model.mode() === 'list' ?
      this._listKey() : this._objectKey();

    const syncValue = this._getItem(key, (error, value) => {
      this._selectGet(error, value);
    });

    if (syncValue instanceof Promise) {
      return this;
    }

    this._selectGet(null, syncValue);
    return this;
  }

  _bindModel() {
    if (this._model) {
      this._model.on('error', this._handleError);
      this._model.on('publish', this._handlePublish);
      this._model.on('select', this._handleSelect);
      this._model.on('set', this._handleSet);
    }
  }

  _unbindModel() {
    if (this._model) {
      this._model.removeListener('error', this._handleError);
      this._model.removeListener('publish', this._handlePublish);
      this._model.removeListener('select', this._handleSelect);
      this._model.removeListener('set', this._handleSet);
    }
  }

  _error(message = '') {
    this.emit('error', new ScolaError('500 invalid_data ' + message));
  }

  _publish() {
    this._destroy();
  }

  _set() {
    this._setItem(this._modelKey(), this._model.local());
  }

  _select(data, total, etag) {
    const key = this._model.mode() === 'list' ?
      this._listKey() : this._objectKey();

    this._addKey(key);

    this._setItem(key, {
      etag,
      data,
      total
    });

    this.emit('select', data, total, etag);
  }

  _destroy(full = false) {
    if (full === true) {
      this._removeItem(this._modelKey());
    }

    const key = this._model.mode() === 'list' ?
      this._listKey() : this._objectKey();

    this._removeItem(key);

    this._index.forEach((dataKey) => {
      this._removeItem(dataKey);
    });

    this._index.clear();
  }

  _addKey(key) {
    const indexKey = this._indexKey();

    const syncValue = this._getItem(indexKey, (error, value) => {
      this._addKeyGet(error, value, indexKey, key);
    });

    if (syncValue instanceof Promise) {
      return;
    }

    this._addKeyGet(null, syncValue, indexKey, key);
  }

  _loadGet(error, value) {
    if (error) {
      this._error(error.message);
      return;
    }

    this._model.local(value);
  }

  _selectGet(error, value) {
    if (error) {
      this._error(error.message);
      return;
    }

    if (value) {
      this._model.etag(value.etag);
      this._model.total(value.total);
      this._model.remote(value.data);
    }

    if (this._model.connected()) {
      this._model.select();
    } else if (value) {
      this.emit('select', value.data, value.total, value.etag);
    } else {
      this._error();
    }
  }

  _addKeyGet(error, value, indexKey, key) {
    if (error) {
      this._error(error.message);
      return;
    }

    value = value || [];

    if (!this._index) {
      this._index = new Set(value);
    }

    this._index.add(key);
    this._setItem(indexKey, Array.from(this._index));
  }

  _getItem(key, callback) {
    const syncValue = this._storage.getItem(key, (error, value) => {
      callback(error, typeof value === 'string' ?
        JSON.parse(value) : null);
    });

    return typeof syncValue === 'string' ?
      JSON.parse(syncValue) : syncValue;
  }

  _setItem(key, value) {
    value = JSON.stringify(value);
    this._storage.setItem(key, value);
  }

  _removeItem(key) {
    this._storage.removeItem(key);
  }

  _modelKey(data = 'model', parse = null) {
    return md5(JSON.stringify({
      path: this._model.path(parse),
      data
    })).toString();
  }

  _indexKey() {
    return this._modelKey('index');
  }

  _listKey() {
    return this._modelKey(this._model.local());
  }

  _objectKey() {
    return this._modelKey('object', true);
  }
}
