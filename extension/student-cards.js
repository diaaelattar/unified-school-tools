/* === Inline Script Block #4 (executable) === */

//---------------------------------------------------------------------
//
// QR Code Generator for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//  http://www.opensource.org/licenses/mit-license.php
//
// The word 'QR Code' is registered trademark of
// DENSO WAVE INCORPORATED
//  http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------

var qrcode = function() {

  //---------------------------------------------------------------------
  // qrcode
  //---------------------------------------------------------------------

  /**
   * qrcode
   * @param typeNumber 1 to 40
   * @param errorCorrectionLevel 'L','M','Q','H'
   */
  var qrcode = function(typeNumber, errorCorrectionLevel) {

    var PAD0 = 0xEC;
    var PAD1 = 0x11;

    var _typeNumber = typeNumber;
    var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
    var _modules = null;
    var _moduleCount = 0;
    var _dataCache = null;
    var _dataList = [];

    var _this = {};

    var makeImpl = function(test, maskPattern) {

      _moduleCount = _typeNumber * 4 + 17;
      _modules = function(moduleCount) {
        var modules = new Array(moduleCount);
        for (var row = 0; row < moduleCount; row += 1) {
          modules[row] = new Array(moduleCount);
          for (var col = 0; col < moduleCount; col += 1) {
            modules[row][col] = null;
          }
        }
        return modules;
      }(_moduleCount);

      setupPositionProbePattern(0, 0);
      setupPositionProbePattern(_moduleCount - 7, 0);
      setupPositionProbePattern(0, _moduleCount - 7);
      setupPositionAdjustPattern();
      setupTimingPattern();
      setupTypeInfo(test, maskPattern);

      if (_typeNumber >= 7) {
        setupTypeNumber(test);
      }

      if (_dataCache == null) {
        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
      }

      mapData(_dataCache, maskPattern);
    };

    var setupPositionProbePattern = function(row, col) {

      for (var r = -1; r <= 7; r += 1) {

        if (row + r <= -1 || _moduleCount <= row + r) continue;

        for (var c = -1; c <= 7; c += 1) {

          if (col + c <= -1 || _moduleCount <= col + c) continue;

          if ( (0 <= r && r <= 6 && (c == 0 || c == 6) )
              || (0 <= c && c <= 6 && (r == 0 || r == 6) )
              || (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
            _modules[row + r][col + c] = true;
          } else {
            _modules[row + r][col + c] = false;
          }
        }
      }
    };

    var getBestMaskPattern = function() {

      var minLostPoint = 0;
      var pattern = 0;

      for (var i = 0; i < 8; i += 1) {

        makeImpl(true, i);

        var lostPoint = QRUtil.getLostPoint(_this);

        if (i == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }

      return pattern;
    };

    var setupTimingPattern = function() {

      for (var r = 8; r < _moduleCount - 8; r += 1) {
        if (_modules[r][6] != null) {
          continue;
        }
        _modules[r][6] = (r % 2 == 0);
      }

      for (var c = 8; c < _moduleCount - 8; c += 1) {
        if (_modules[6][c] != null) {
          continue;
        }
        _modules[6][c] = (c % 2 == 0);
      }
    };

    var setupPositionAdjustPattern = function() {

      var pos = QRUtil.getPatternPosition(_typeNumber);

      for (var i = 0; i < pos.length; i += 1) {

        for (var j = 0; j < pos.length; j += 1) {

          var row = pos[i];
          var col = pos[j];

          if (_modules[row][col] != null) {
            continue;
          }

          for (var r = -2; r <= 2; r += 1) {

            for (var c = -2; c <= 2; c += 1) {

              if (r == -2 || r == 2 || c == -2 || c == 2
                  || (r == 0 && c == 0) ) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    };

    var setupTypeNumber = function(test) {

      var bits = QRUtil.getBCHTypeNumber(_typeNumber);

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
      }

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    };

    var setupTypeInfo = function(test, maskPattern) {

      var data = (_errorCorrectionLevel << 3) | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);

      // vertical
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 6) {
          _modules[i][8] = mod;
        } else if (i < 8) {
          _modules[i + 1][8] = mod;
        } else {
          _modules[_moduleCount - 15 + i][8] = mod;
        }
      }

      // horizontal
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 8) {
          _modules[8][_moduleCount - i - 1] = mod;
        } else if (i < 9) {
          _modules[8][15 - i - 1 + 1] = mod;
        } else {
          _modules[8][15 - i - 1] = mod;
        }
      }

      // fixed module
      _modules[_moduleCount - 8][8] = (!test);
    };

    var mapData = function(data, maskPattern) {

      var inc = -1;
      var row = _moduleCount - 1;
      var bitIndex = 7;
      var byteIndex = 0;
      var maskFunc = QRUtil.getMaskFunction(maskPattern);

      for (var col = _moduleCount - 1; col > 0; col -= 2) {

        if (col == 6) col -= 1;

        while (true) {

          for (var c = 0; c < 2; c += 1) {

            if (_modules[row][col - c] == null) {

              var dark = false;

              if (byteIndex < data.length) {
                dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1);
              }

              var mask = maskFunc(row, col - c);

              if (mask) {
                dark = !dark;
              }

              _modules[row][col - c] = dark;
              bitIndex -= 1;

              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }

          row += inc;

          if (row < 0 || _moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    };

    var createBytes = function(buffer, rsBlocks) {

      var offset = 0;

      var maxDcCount = 0;
      var maxEcCount = 0;

      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);

      for (var r = 0; r < rsBlocks.length; r += 1) {

        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;

        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);

        dcdata[r] = new Array(dcCount);

        for (var i = 0; i < dcdata[r].length; i += 1) {
          dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
        }
        offset += dcCount;

        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);

        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var i = 0; i < ecdata[r].length; i += 1) {
          var modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = (modIndex >= 0)? modPoly.getAt(modIndex) : 0;
        }
      }

      var totalCodeCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalCodeCount += rsBlocks[i].totalCount;
      }

      var data = new Array(totalCodeCount);
      var index = 0;

      for (var i = 0; i < maxDcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < dcdata[r].length) {
            data[index] = dcdata[r][i];
            index += 1;
          }
        }
      }

      for (var i = 0; i < maxEcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < ecdata[r].length) {
            data[index] = ecdata[r][i];
            index += 1;
          }
        }
      }

      return data;
    };

    var createData = function(typeNumber, errorCorrectionLevel, dataList) {

      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);

      var buffer = qrBitBuffer();

      for (var i = 0; i < dataList.length; i += 1) {
        var data = dataList[i];
        buffer.put(data.getMode(), 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
        data.write(buffer);
      }

      // calc num max data.
      var totalDataCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalDataCount += rsBlocks[i].dataCount;
      }

      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw 'code length overflow. ('
          + buffer.getLengthInBits()
          + '>'
          + totalDataCount * 8
          + ')';
      }

      // end code
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }

      // padding
      while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
      }

      // padding
      while (true) {

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD0, 8);

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD1, 8);
      }

      return createBytes(buffer, rsBlocks);
    };

    _this.addData = function(data, mode) {

      mode = mode || 'Byte';

      var newData = null;

      switch(mode) {
      case 'Numeric' :
        newData = qrNumber(data);
        break;
      case 'Alphanumeric' :
        newData = qrAlphaNum(data);
        break;
      case 'Byte' :
        newData = qr8BitByte(data);
        break;
      case 'Kanji' :
        newData = qrKanji(data);
        break;
      default :
        throw 'mode:' + mode;
      }

      _dataList.push(newData);
      _dataCache = null;
    };

    _this.isDark = function(row, col) {
      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
        throw row + ',' + col;
      }
      return _modules[row][col];
    };

    _this.getModuleCount = function() {
      return _moduleCount;
    };

    _this.make = function() {
      if (_typeNumber < 1) {
        var typeNumber = 1;

        for (; typeNumber < 40; typeNumber++) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
          var buffer = qrBitBuffer();

          for (var i = 0; i < _dataList.length; i++) {
            var data = _dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
            data.write(buffer);
          }

          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }

          if (buffer.getLengthInBits() <= totalDataCount * 8) {
            break;
          }
        }

        _typeNumber = typeNumber;
      }

      makeImpl(false, getBestMaskPattern() );
    };

    _this.createTableTag = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var qrHtml = '';

      qrHtml += '<table style="';
      qrHtml += ' border-width: 0px; border-style: none;';
      qrHtml += ' border-collapse: collapse;';
      qrHtml += ' padding: 0px; margin: ' + margin + 'px;';
      qrHtml += '">';
      qrHtml += '<tbody>';

      for (var r = 0; r < _this.getModuleCount(); r += 1) {

        qrHtml += '<tr>';

        for (var c = 0; c < _this.getModuleCount(); c += 1) {
          qrHtml += '<td style="';
          qrHtml += ' border-width: 0px; border-style: none;';
          qrHtml += ' border-collapse: collapse;';
          qrHtml += ' padding: 0px; margin: 0px;';
          qrHtml += ' width: ' + cellSize + 'px;';
          qrHtml += ' height: ' + cellSize + 'px;';
          qrHtml += ' background-color: ';
          qrHtml += _this.isDark(r, c)? '#000000' : '#ffffff';
          qrHtml += ';';
          qrHtml += '"/>';
        }

        qrHtml += '</tr>';
      }

      qrHtml += '</tbody>';
      qrHtml += '</table>';

      return qrHtml;
    };

    _this.createSvgTag = function(cellSize, margin, alt, title) {

      var opts = {};
      if (typeof arguments[0] == 'object') {
        // Called by options.
        opts = arguments[0];
        // overwrite cellSize and margin.
        cellSize = opts.cellSize;
        margin = opts.margin;
        alt = opts.alt;
        title = opts.title;
      }

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      // Compose alt property surrogate
      alt = (typeof alt === 'string') ? {text: alt} : alt || {};
      alt.text = alt.text || null;
      alt.id = (alt.text) ? alt.id || 'qrcode-description' : null;

      // Compose title property surrogate
      title = (typeof title === 'string') ? {text: title} : title || {};
      title.text = title.text || null;
      title.id = (title.text) ? title.id || 'qrcode-title' : null;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var c, mc, r, mr, qrSvg='', rect;

      rect = 'l' + cellSize + ',0 0,' + cellSize +
        ' -' + cellSize + ',0 0,-' + cellSize + 'z ';

      qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
      qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : '';
      qrSvg += ' viewBox="0 0 ' + size + ' ' + size + '" ';
      qrSvg += ' preserveAspectRatio="xMinYMin meet"';
      qrSvg += (title.text || alt.text) ? ' role="img" aria-labelledby="' +
          escapeXml([title.id, alt.id].join(' ').trim() ) + '"' : '';
      qrSvg += '>';
      qrSvg += (title.text) ? '<title id="' + escapeXml(title.id) + '">' +
          escapeXml(title.text) + '</title>' : '';
      qrSvg += (alt.text) ? '<description id="' + escapeXml(alt.id) + '">' +
          escapeXml(alt.text) + '</description>' : '';
      qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
      qrSvg += '<path d="';

      for (r = 0; r < _this.getModuleCount(); r += 1) {
        mr = r * cellSize + margin;
        for (c = 0; c < _this.getModuleCount(); c += 1) {
          if (_this.isDark(r, c) ) {
            mc = c*cellSize+margin;
            qrSvg += 'M' + mc + ',' + mr + rect;
          }
        }
      }

      qrSvg += '" stroke="transparent" fill="black"/>';
      qrSvg += '</svg>';

      return qrSvg;
    };

    _this.createDataURL = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      return createDataURL(size, size, function(x, y) {
        if (min <= x && x < max && min <= y && y < max) {
          var c = Math.floor( (x - min) / cellSize);
          var r = Math.floor( (y - min) / cellSize);
          return _this.isDark(r, c)? 0 : 1;
        } else {
          return 1;
        }
      } );
    };

    _this.createImgTag = function(cellSize, margin, alt) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;

      var img = '';
      img += '<img';
      img += '\u0020src="';
      img += _this.createDataURL(cellSize, margin);
      img += '"';
      img += '\u0020width="';
      img += size;
      img += '"';
      img += '\u0020height="';
      img += size;
      img += '"';
      if (alt) {
        img += '\u0020alt="';
        img += escapeXml(alt);
        img += '"';
      }
      img += '/>';

      return img;
    };

    var escapeXml = function(s) {
      var escaped = '';
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charAt(i);
        switch(c) {
        case '<': escaped += '&lt;'; break;
        case '>': escaped += '&gt;'; break;
        case '&': escaped += '&amp;'; break;
        case '"': escaped += '&quot;'; break;
        default : escaped += c; break;
        }
      }
      return escaped;
    };

    var _createHalfASCII = function(margin) {
      var cellSize = 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r1, r2, p;

      var blocks = {
        '██': '█',
        '█ ': '▀',
        ' █': '▄',
        '  ': ' '
      };

      var blocksLastLineNoMargin = {
        '██': '▀',
        '█ ': '▀',
        ' █': ' ',
        '  ': ' '
      };

      var ascii = '';
      for (y = 0; y < size; y += 2) {
        r1 = Math.floor((y - min) / cellSize);
        r2 = Math.floor((y + 1 - min) / cellSize);
        for (x = 0; x < size; x += 1) {
          p = '█';

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
            p = ' ';
          }

          if (min <= x && x < max && min <= y+1 && y+1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
            p += ' ';
          }
          else {
            p += '█';
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          ascii += (margin < 1 && y+1 >= max) ? blocksLastLineNoMargin[p] : blocks[p];
        }

        ascii += '\n';
      }

      if (size % 2 && margin > 0) {
        return ascii.substring(0, ascii.length - size - 1) + Array(size+1).join('▀');
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.createASCII = function(cellSize, margin) {
      cellSize = cellSize || 1;

      if (cellSize < 2) {
        return _createHalfASCII(margin);
      }

      cellSize -= 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r, p;

      var white = Array(cellSize+1).join('██');
      var black = Array(cellSize+1).join('  ');

      var ascii = '';
      var line = '';
      for (y = 0; y < size; y += 1) {
        r = Math.floor( (y - min) / cellSize);
        line = '';
        for (x = 0; x < size; x += 1) {
          p = 1;

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
            p = 0;
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          line += p ? white : black;
        }

        for (r = 0; r < cellSize; r += 1) {
          ascii += line + '\n';
        }
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.renderTo2dContext = function(context, cellSize) {
      cellSize = cellSize || 2;
      var length = _this.getModuleCount();
      for (var row = 0; row < length; row++) {
        for (var col = 0; col < length; col++) {
          context.fillStyle = _this.isDark(row, col) ? 'black' : 'white';
          context.fillRect(row * cellSize, col * cellSize, cellSize, cellSize);
        }
      }
    }

    return _this;
  };

  //---------------------------------------------------------------------
  // qrcode.stringToBytes
  //---------------------------------------------------------------------

  qrcode.stringToBytesFuncs = {
    'default' : function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        bytes.push(c & 0xff);
      }
      return bytes;
    }
  };

  qrcode.stringToBytes = qrcode.stringToBytesFuncs['default'];

  //---------------------------------------------------------------------
  // qrcode.createStringToBytes
  //---------------------------------------------------------------------

  /**
   * @param unicodeData base64 string of byte array.
   * [16bit Unicode],[16bit Bytes], ...
   * @param numChars
   */
  qrcode.createStringToBytes = function(unicodeData, numChars) {

    // create conversion map.

    var unicodeMap = function() {

      var bin = base64DecodeInputStream(unicodeData);
      var read = function() {
        var b = bin.read();
        if (b == -1) throw 'eof';
        return b;
      };

      var count = 0;
      var unicodeMap = {};
      while (true) {
        var b0 = bin.read();
        if (b0 == -1) break;
        var b1 = read();
        var b2 = read();
        var b3 = read();
        var k = String.fromCharCode( (b0 << 8) | b1);
        var v = (b2 << 8) | b3;
        unicodeMap[k] = v;
        count += 1;
      }
      if (count != numChars) {
        throw count + ' != ' + numChars;
      }

      return unicodeMap;
    }();

    var unknownChar = '?'.charCodeAt(0);

    return function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        if (c < 128) {
          bytes.push(c);
        } else {
          var b = unicodeMap[s.charAt(i)];
          if (typeof b == 'number') {
            if ( (b & 0xff) == b) {
              // 1byte
              bytes.push(b);
            } else {
              // 2bytes
              bytes.push(b >>> 8);
              bytes.push(b & 0xff);
            }
          } else {
            bytes.push(unknownChar);
          }
        }
      }
      return bytes;
    };
  };

  //---------------------------------------------------------------------
  // QRMode
  //---------------------------------------------------------------------

  var QRMode = {
    MODE_NUMBER :    1 << 0,
    MODE_ALPHA_NUM : 1 << 1,
    MODE_8BIT_BYTE : 1 << 2,
    MODE_KANJI :     1 << 3
  };

  //---------------------------------------------------------------------
  // QRErrorCorrectionLevel
  //---------------------------------------------------------------------

  var QRErrorCorrectionLevel = {
    L : 1,
    M : 0,
    Q : 3,
    H : 2
  };

  //---------------------------------------------------------------------
  // QRMaskPattern
  //---------------------------------------------------------------------

  var QRMaskPattern = {
    PATTERN000 : 0,
    PATTERN001 : 1,
    PATTERN010 : 2,
    PATTERN011 : 3,
    PATTERN100 : 4,
    PATTERN101 : 5,
    PATTERN110 : 6,
    PATTERN111 : 7
  };

  //---------------------------------------------------------------------
  // QRUtil
  //---------------------------------------------------------------------

  var QRUtil = function() {

    var PATTERN_POSITION_TABLE = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ];
    var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

    var _this = {};

    var getBCHDigit = function(data) {
      var digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    };

    _this.getBCHTypeInfo = function(data) {
      var d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
        d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15) ) );
      }
      return ( (data << 10) | d) ^ G15_MASK;
    };

    _this.getBCHTypeNumber = function(data) {
      var d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
        d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18) ) );
      }
      return (data << 12) | d;
    };

    _this.getPatternPosition = function(typeNumber) {
      return PATTERN_POSITION_TABLE[typeNumber - 1];
    };

    _this.getMaskFunction = function(maskPattern) {

      switch (maskPattern) {

      case QRMaskPattern.PATTERN000 :
        return function(i, j) { return (i + j) % 2 == 0; };
      case QRMaskPattern.PATTERN001 :
        return function(i, j) { return i % 2 == 0; };
      case QRMaskPattern.PATTERN010 :
        return function(i, j) { return j % 3 == 0; };
      case QRMaskPattern.PATTERN011 :
        return function(i, j) { return (i + j) % 3 == 0; };
      case QRMaskPattern.PATTERN100 :
        return function(i, j) { return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0; };
      case QRMaskPattern.PATTERN101 :
        return function(i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };
      case QRMaskPattern.PATTERN110 :
        return function(i, j) { return ( (i * j) % 2 + (i * j) % 3) % 2 == 0; };
      case QRMaskPattern.PATTERN111 :
        return function(i, j) { return ( (i * j) % 3 + (i + j) % 2) % 2 == 0; };

      default :
        throw 'bad maskPattern:' + maskPattern;
      }
    };

    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
      var a = qrPolynomial([1], 0);
      for (var i = 0; i < errorCorrectLength; i += 1) {
        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0) );
      }
      return a;
    };

    _this.getLengthInBits = function(mode, type) {

      if (1 <= type && type < 10) {

        // 1 - 9

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 10;
        case QRMode.MODE_ALPHA_NUM : return 9;
        case QRMode.MODE_8BIT_BYTE : return 8;
        case QRMode.MODE_KANJI     : return 8;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 27) {

        // 10 - 26

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 12;
        case QRMode.MODE_ALPHA_NUM : return 11;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 10;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 41) {

        // 27 - 40

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 14;
        case QRMode.MODE_ALPHA_NUM : return 13;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 12;
        default :
          throw 'mode:' + mode;
        }

      } else {
        throw 'type:' + type;
      }
    };

    _this.getLostPoint = function(qrcode) {

      var moduleCount = qrcode.getModuleCount();

      var lostPoint = 0;

      // LEVEL1

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount; col += 1) {

          var sameCount = 0;
          var dark = qrcode.isDark(row, col);

          for (var r = -1; r <= 1; r += 1) {

            if (row + r < 0 || moduleCount <= row + r) {
              continue;
            }

            for (var c = -1; c <= 1; c += 1) {

              if (col + c < 0 || moduleCount <= col + c) {
                continue;
              }

              if (r == 0 && c == 0) {
                continue;
              }

              if (dark == qrcode.isDark(row + r, col + c) ) {
                sameCount += 1;
              }
            }
          }

          if (sameCount > 5) {
            lostPoint += (3 + sameCount - 5);
          }
        }
      };

      // LEVEL2

      for (var row = 0; row < moduleCount - 1; row += 1) {
        for (var col = 0; col < moduleCount - 1; col += 1) {
          var count = 0;
          if (qrcode.isDark(row, col) ) count += 1;
          if (qrcode.isDark(row + 1, col) ) count += 1;
          if (qrcode.isDark(row, col + 1) ) count += 1;
          if (qrcode.isDark(row + 1, col + 1) ) count += 1;
          if (count == 0 || count == 4) {
            lostPoint += 3;
          }
        }
      }

      // LEVEL3

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount - 6; col += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row, col + 1)
              &&  qrcode.isDark(row, col + 2)
              &&  qrcode.isDark(row, col + 3)
              &&  qrcode.isDark(row, col + 4)
              && !qrcode.isDark(row, col + 5)
              &&  qrcode.isDark(row, col + 6) ) {
            lostPoint += 40;
          }
        }
      }

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount - 6; row += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row + 1, col)
              &&  qrcode.isDark(row + 2, col)
              &&  qrcode.isDark(row + 3, col)
              &&  qrcode.isDark(row + 4, col)
              && !qrcode.isDark(row + 5, col)
              &&  qrcode.isDark(row + 6, col) ) {
            lostPoint += 40;
          }
        }
      }

      // LEVEL4

      var darkCount = 0;

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount; row += 1) {
          if (qrcode.isDark(row, col) ) {
            darkCount += 1;
          }
        }
      }

      var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;

      return lostPoint;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // QRMath
  //---------------------------------------------------------------------

  var QRMath = function() {

    var EXP_TABLE = new Array(256);
    var LOG_TABLE = new Array(256);

    // initialize tables
    for (var i = 0; i < 8; i += 1) {
      EXP_TABLE[i] = 1 << i;
    }
    for (var i = 8; i < 256; i += 1) {
      EXP_TABLE[i] = EXP_TABLE[i - 4]
        ^ EXP_TABLE[i - 5]
        ^ EXP_TABLE[i - 6]
        ^ EXP_TABLE[i - 8];
    }
    for (var i = 0; i < 255; i += 1) {
      LOG_TABLE[EXP_TABLE[i] ] = i;
    }

    var _this = {};

    _this.glog = function(n) {

      if (n < 1) {
        throw 'glog(' + n + ')';
      }

      return LOG_TABLE[n];
    };

    _this.gexp = function(n) {

      while (n < 0) {
        n += 255;
      }

      while (n >= 256) {
        n -= 255;
      }

      return EXP_TABLE[n];
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrPolynomial
  //---------------------------------------------------------------------

  function qrPolynomial(num, shift) {

    if (typeof num.length == 'undefined') {
      throw num.length + '/' + shift;
    }

    var _num = function() {
      var offset = 0;
      while (offset < num.length && num[offset] == 0) {
        offset += 1;
      }
      var _num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i += 1) {
        _num[i] = num[i + offset];
      }
      return _num;
    }();

    var _this = {};

    _this.getAt = function(index) {
      return _num[index];
    };

    _this.getLength = function() {
      return _num.length;
    };

    _this.multiply = function(e) {

      var num = new Array(_this.getLength() + e.getLength() - 1);

      for (var i = 0; i < _this.getLength(); i += 1) {
        for (var j = 0; j < e.getLength(); j += 1) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i) ) + QRMath.glog(e.getAt(j) ) );
        }
      }

      return qrPolynomial(num, 0);
    };

    _this.mod = function(e) {

      if (_this.getLength() - e.getLength() < 0) {
        return _this;
      }

      var ratio = QRMath.glog(_this.getAt(0) ) - QRMath.glog(e.getAt(0) );

      var num = new Array(_this.getLength() );
      for (var i = 0; i < _this.getLength(); i += 1) {
        num[i] = _this.getAt(i);
      }

      for (var i = 0; i < e.getLength(); i += 1) {
        num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i) ) + ratio);
      }

      // recursive call
      return qrPolynomial(num, 0).mod(e);
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // QRRSBlock
  //---------------------------------------------------------------------

  var QRRSBlock = function() {

    var RS_BLOCK_TABLE = [

      // L
      // M
      // Q
      // H

      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],

      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],

      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],

      // 4
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],

      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],

      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],

      // 7
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],

      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],

      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],

      // 10
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],

      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],

      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],

      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],

      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],

      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12, 7, 37, 13],

      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],

      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],

      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],

      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],

      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],

      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],

      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],

      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],

      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],

      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],

      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],

      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],

      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],

      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],

      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],

      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],

      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],

      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],

      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],

      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],

      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],

      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],

      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],

      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],

      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];

    var qrRSBlock = function(totalCount, dataCount) {
      var _this = {};
      _this.totalCount = totalCount;
      _this.dataCount = dataCount;
      return _this;
    };

    var _this = {};

    var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {

      switch(errorCorrectionLevel) {
      case QRErrorCorrectionLevel.L :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectionLevel.M :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectionLevel.Q :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectionLevel.H :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default :
        return undefined;
      }
    };

    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {

      var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);

      if (typeof rsBlock == 'undefined') {
        throw 'bad rs block @ typeNumber:' + typeNumber +
            '/errorCorrectionLevel:' + errorCorrectionLevel;
      }

      var length = rsBlock.length / 3;

      var list = [];

      for (var i = 0; i < length; i += 1) {

        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];

        for (var j = 0; j < count; j += 1) {
          list.push(qrRSBlock(totalCount, dataCount) );
        }
      }

      return list;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrBitBuffer
  //---------------------------------------------------------------------

  var qrBitBuffer = function() {

    var _buffer = [];
    var _length = 0;

    var _this = {};

    _this.getBuffer = function() {
      return _buffer;
    };

    _this.getAt = function(index) {
      var bufIndex = Math.floor(index / 8);
      return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
    };

    _this.put = function(num, length) {
      for (var i = 0; i < length; i += 1) {
        _this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
      }
    };

    _this.getLengthInBits = function() {
      return _length;
    };

    _this.putBit = function(bit) {

      var bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }

      if (bit) {
        _buffer[bufIndex] |= (0x80 >>> (_length % 8) );
      }

      _length += 1;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrNumber
  //---------------------------------------------------------------------

  var qrNumber = function(data) {

    var _mode = QRMode.MODE_NUMBER;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var data = _data;

      var i = 0;

      while (i + 2 < data.length) {
        buffer.put(strToNum(data.substring(i, i + 3) ), 10);
        i += 3;
      }

      if (i < data.length) {
        if (data.length - i == 1) {
          buffer.put(strToNum(data.substring(i, i + 1) ), 4);
        } else if (data.length - i == 2) {
          buffer.put(strToNum(data.substring(i, i + 2) ), 7);
        }
      }
    };

    var strToNum = function(s) {
      var num = 0;
      for (var i = 0; i < s.length; i += 1) {
        num = num * 10 + chatToNum(s.charAt(i) );
      }
      return num;
    };

    var chatToNum = function(c) {
      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      }
      throw 'illegal char :' + c;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrAlphaNum
  //---------------------------------------------------------------------

  var qrAlphaNum = function(data) {

    var _mode = QRMode.MODE_ALPHA_NUM;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var s = _data;

      var i = 0;

      while (i + 1 < s.length) {
        buffer.put(
          getCode(s.charAt(i) ) * 45 +
          getCode(s.charAt(i + 1) ), 11);
        i += 2;
      }

      if (i < s.length) {
        buffer.put(getCode(s.charAt(i) ), 6);
      }
    };

    var getCode = function(c) {

      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      } else if ('A' <= c && c <= 'Z') {
        return c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
      } else {
        switch (c) {
        case ' ' : return 36;
        case '$' : return 37;
        case '%' : return 38;
        case '*' : return 39;
        case '+' : return 40;
        case '-' : return 41;
        case '.' : return 42;
        case '/' : return 43;
        case ':' : return 44;
        default :
          throw 'illegal char :' + c;
        }
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qr8BitByte
  //---------------------------------------------------------------------

  var qr8BitByte = function(data) {

    var _mode = QRMode.MODE_8BIT_BYTE;
    var _data = data;
    var _bytes = qrcode.stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _bytes.length;
    };

    _this.write = function(buffer) {
      for (var i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrKanji
  //---------------------------------------------------------------------

  var qrKanji = function(data) {

    var _mode = QRMode.MODE_KANJI;
    var _data = data;

    var stringToBytes = qrcode.stringToBytesFuncs['SJIS'];
    if (!stringToBytes) {
      throw 'sjis not supported.';
    }
    !function(c, code) {
      // self test for sjis support.
      var test = stringToBytes(c);
      if (test.length != 2 || ( (test[0] << 8) | test[1]) != code) {
        throw 'sjis not supported.';
      }
    }('\u53cb', 0x9746);

    var _bytes = stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return ~~(_bytes.length / 2);
    };

    _this.write = function(buffer) {

      var data = _bytes;

      var i = 0;

      while (i + 1 < data.length) {

        var c = ( (0xff & data[i]) << 8) | (0xff & data[i + 1]);

        if (0x8140 <= c && c <= 0x9FFC) {
          c -= 0x8140;
        } else if (0xE040 <= c && c <= 0xEBBF) {
          c -= 0xC140;
        } else {
          throw 'illegal char at ' + (i + 1) + '/' + c;
        }

        c = ( (c >>> 8) & 0xff) * 0xC0 + (c & 0xff);

        buffer.put(c, 13);

        i += 2;
      }

      if (i < data.length) {
        throw 'illegal char at ' + (i + 1);
      }
    };

    return _this;
  };

  //=====================================================================
  // GIF Support etc.
  //

  //---------------------------------------------------------------------
  // byteArrayOutputStream
  //---------------------------------------------------------------------

  var byteArrayOutputStream = function() {

    var _bytes = [];

    var _this = {};

    _this.writeByte = function(b) {
      _bytes.push(b & 0xff);
    };

    _this.writeShort = function(i) {
      _this.writeByte(i);
      _this.writeByte(i >>> 8);
    };

    _this.writeBytes = function(b, off, len) {
      off = off || 0;
      len = len || b.length;
      for (var i = 0; i < len; i += 1) {
        _this.writeByte(b[i + off]);
      }
    };

    _this.writeString = function(s) {
      for (var i = 0; i < s.length; i += 1) {
        _this.writeByte(s.charCodeAt(i) );
      }
    };

    _this.toByteArray = function() {
      return _bytes;
    };

    _this.toString = function() {
      var s = '';
      s += '[';
      for (var i = 0; i < _bytes.length; i += 1) {
        if (i > 0) {
          s += ',';
        }
        s += _bytes[i];
      }
      s += ']';
      return s;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64EncodeOutputStream
  //---------------------------------------------------------------------

  var base64EncodeOutputStream = function() {

    var _buffer = 0;
    var _buflen = 0;
    var _length = 0;
    var _base64 = '';

    var _this = {};

    var writeEncoded = function(b) {
      _base64 += String.fromCharCode(encode(b & 0x3f) );
    };

    var encode = function(n) {
      if (n < 0) {
        // error.
      } else if (n < 26) {
        return 0x41 + n;
      } else if (n < 52) {
        return 0x61 + (n - 26);
      } else if (n < 62) {
        return 0x30 + (n - 52);
      } else if (n == 62) {
        return 0x2b;
      } else if (n == 63) {
        return 0x2f;
      }
      throw 'n:' + n;
    };

    _this.writeByte = function(n) {

      _buffer = (_buffer << 8) | (n & 0xff);
      _buflen += 8;
      _length += 1;

      while (_buflen >= 6) {
        writeEncoded(_buffer >>> (_buflen - 6) );
        _buflen -= 6;
      }
    };

    _this.flush = function() {

      if (_buflen > 0) {
        writeEncoded(_buffer << (6 - _buflen) );
        _buffer = 0;
        _buflen = 0;
      }

      if (_length % 3 != 0) {
        // padding
        var padlen = 3 - _length % 3;
        for (var i = 0; i < padlen; i += 1) {
          _base64 += '=';
        }
      }
    };

    _this.toString = function() {
      return _base64;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64DecodeInputStream
  //---------------------------------------------------------------------

  var base64DecodeInputStream = function(str) {

    var _str = str;
    var _pos = 0;
    var _buffer = 0;
    var _buflen = 0;

    var _this = {};

    _this.read = function() {

      while (_buflen < 8) {

        if (_pos >= _str.length) {
          if (_buflen == 0) {
            return -1;
          }
          throw 'unexpected end of file./' + _buflen;
        }

        var c = _str.charAt(_pos);
        _pos += 1;

        if (c == '=') {
          _buflen = 0;
          return -1;
        } else if (c.match(/^\s$/) ) {
          // ignore if whitespace.
          continue;
        }

        _buffer = (_buffer << 6) | decode(c.charCodeAt(0) );
        _buflen += 6;
      }

      var n = (_buffer >>> (_buflen - 8) ) & 0xff;
      _buflen -= 8;
      return n;
    };

    var decode = function(c) {
      if (0x41 <= c && c <= 0x5a) {
        return c - 0x41;
      } else if (0x61 <= c && c <= 0x7a) {
        return c - 0x61 + 26;
      } else if (0x30 <= c && c <= 0x39) {
        return c - 0x30 + 52;
      } else if (c == 0x2b) {
        return 62;
      } else if (c == 0x2f) {
        return 63;
      } else {
        throw 'c:' + c;
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // gifImage (B/W)
  //---------------------------------------------------------------------

  var gifImage = function(width, height) {

    var _width = width;
    var _height = height;
    var _data = new Array(width * height);

    var _this = {};

    _this.setPixel = function(x, y, pixel) {
      _data[y * _width + x] = pixel;
    };

    _this.write = function(out) {

      //---------------------------------
      // GIF Signature

      out.writeString('GIF87a');

      //---------------------------------
      // Screen Descriptor

      out.writeShort(_width);
      out.writeShort(_height);

      out.writeByte(0x80); // 2bit
      out.writeByte(0);
      out.writeByte(0);

      //---------------------------------
      // Global Color Map

      // black
      out.writeByte(0x00);
      out.writeByte(0x00);
      out.writeByte(0x00);

      // white
      out.writeByte(0xff);
      out.writeByte(0xff);
      out.writeByte(0xff);

      //---------------------------------
      // Image Descriptor

      out.writeString(',');
      out.writeShort(0);
      out.writeShort(0);
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(0);

      //---------------------------------
      // Local Color Map

      //---------------------------------
      // Raster Data

      var lzwMinCodeSize = 2;
      var raster = getLZWRaster(lzwMinCodeSize);

      out.writeByte(lzwMinCodeSize);

      var offset = 0;

      while (raster.length - offset > 255) {
        out.writeByte(255);
        out.writeBytes(raster, offset, 255);
        offset += 255;
      }

      out.writeByte(raster.length - offset);
      out.writeBytes(raster, offset, raster.length - offset);
      out.writeByte(0x00);

      //---------------------------------
      // GIF Terminator
      out.writeString(';');
    };

    var bitOutputStream = function(out) {

      var _out = out;
      var _bitLength = 0;
      var _bitBuffer = 0;

      var _this = {};

      _this.write = function(data, length) {

        if ( (data >>> length) != 0) {
          throw 'length over';
        }

        while (_bitLength + length >= 8) {
          _out.writeByte(0xff & ( (data << _bitLength) | _bitBuffer) );
          length -= (8 - _bitLength);
          data >>>= (8 - _bitLength);
          _bitBuffer = 0;
          _bitLength = 0;
        }

        _bitBuffer = (data << _bitLength) | _bitBuffer;
        _bitLength = _bitLength + length;
      };

      _this.flush = function() {
        if (_bitLength > 0) {
          _out.writeByte(_bitBuffer);
        }
      };

      return _this;
    };

    var getLZWRaster = function(lzwMinCodeSize) {

      var clearCode = 1 << lzwMinCodeSize;
      var endCode = (1 << lzwMinCodeSize) + 1;
      var bitLength = lzwMinCodeSize + 1;

      // Setup LZWTable
      var table = lzwTable();

      for (var i = 0; i < clearCode; i += 1) {
        table.add(String.fromCharCode(i) );
      }
      table.add(String.fromCharCode(clearCode) );
      table.add(String.fromCharCode(endCode) );

      var byteOut = byteArrayOutputStream();
      var bitOut = bitOutputStream(byteOut);

      // clear code
      bitOut.write(clearCode, bitLength);

      var dataIndex = 0;

      var s = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;

      while (dataIndex < _data.length) {

        var c = String.fromCharCode(_data[dataIndex]);
        dataIndex += 1;

        if (table.contains(s + c) ) {

          s = s + c;

        } else {

          bitOut.write(table.indexOf(s), bitLength);

          if (table.size() < 0xfff) {

            if (table.size() == (1 << bitLength) ) {
              bitLength += 1;
            }

            table.add(s + c);
          }

          s = c;
        }
      }

      bitOut.write(table.indexOf(s), bitLength);

      // end code
      bitOut.write(endCode, bitLength);

      bitOut.flush();

      return byteOut.toByteArray();
    };

    var lzwTable = function() {

      var _map = {};
      var _size = 0;

      var _this = {};

      _this.add = function(key) {
        if (_this.contains(key) ) {
          throw 'dup key:' + key;
        }
        _map[key] = _size;
        _size += 1;
      };

      _this.size = function() {
        return _size;
      };

      _this.indexOf = function(key) {
        return _map[key];
      };

      _this.contains = function(key) {
        return typeof _map[key] != 'undefined';
      };

      return _this;
    };

    return _this;
  };

  var createDataURL = function(width, height, getPixel) {
    var gif = gifImage(width, height);
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        gif.setPixel(x, y, getPixel(x, y) );
      }
    }

    var b = byteArrayOutputStream();
    gif.write(b);

    var base64 = base64EncodeOutputStream();
    var bytes = b.toByteArray();
    for (var i = 0; i < bytes.length; i += 1) {
      base64.writeByte(bytes[i]);
    }
    base64.flush();

    return 'data:image/gif;base64,' + base64;
  };

  //---------------------------------------------------------------------
  // returns qrcode function.

  return qrcode;
}();

// multibyte support
!function() {

  qrcode.stringToBytesFuncs['UTF-8'] = function(s) {
    // http://stackoverflow.com/questions/18729405/how-to-convert-utf8-string-to-byte-array
    function toUTF8Array(str) {
      var utf8 = [];
      for (var i=0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6),
              0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
          i++;
          // UTF-16 encodes 0x10000-0x10FFFF by
          // subtracting 0x10000 and splitting the
          // 20 bits of 0x0-0xFFFFF into two halves
          charcode = 0x10000 + (((charcode & 0x3ff)<<10)
            | (str.charCodeAt(i) & 0x3ff));
          utf8.push(0xf0 | (charcode >>18),
              0x80 | ((charcode>>12) & 0x3f),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
      }
      return utf8;
    }
    return toUTF8Array(s);
  };

}();

(function (factory) {
  if (typeof define === 'function' && define.amd) {
      define([], factory);
  } else if (typeof exports === 'object') {
      module.exports = factory();
  }
}(function () {
    return qrcode;
}));


;
/* === Inline Script Block #5 (executable) === */

/* generated tables */
const SEGOE_TABLE={2:"\r",3:" ",4:"!",5:"\"",19:"0",20:"1",21:"2",22:"3",23:"4",24:"5",25:"6",26:"7",27:"8",28:"9",29:":",34:"?",36:"A",37:"B",38:"C",39:"D",40:"E",41:"F",42:"G",43:"H",45:"J",46:"K",47:"L",48:"M",49:"N",51:"P",52:"Q",53:"R",54:"S",55:"T",56:"U",57:"V",58:"W",59:"X",60:"Y",61:"Z",66:"_",68:"a",69:"b",70:"c",71:"d",72:"e",73:"f",74:"g",75:"h",76:"i",77:"j",78:"k",80:"m",81:"n",83:"p",84:"q",85:"r",86:"s",87:"t",88:"u",89:"v",90:"w",91:"x",92:"y",93:"z",214:"\u0131",219:"\u02d9",311:"\u207f",1708:"\u0237",2197:"\u2071",2198:"\u00b2",2199:"\u00b3",2200:"\u00b9",2201:"\u2070",2202:"\u2074",2203:"\u2075",2204:"\u2076",2205:"\u2077",2206:"\u2078",2207:"\u2079",2213:"\u2080",2214:"\u2081",2215:"\u2082",2216:"\u2083",2217:"\u2084",2218:"\u2085",2219:"\u2086",2220:"\u2087",2221:"\u2088",2222:"\u2089",2243:"\u200c",2244:"\u200d",2245:"\u200e",2246:"\u200f",2247:"\u0627",2248:"\u0623",2249:"\u0622",2250:"\u0625",2251:"\u0628",2252:"\u062a",2253:"\u062b",2254:"\u062c",2255:"\u062c",2256:"\u062d",2257:"\u062d",2258:"\u062e",2259:"\u062e",2260:"\u0633",2261:"\u0634",2262:"\u0635",2273:"\u0636",2274:"\u0639",2275:"\u0639",2276:"\u0639",2277:"\u063a",2278:"\u063a",2279:"\u063a",2280:"\u0641",2281:"\u0641",2283:"\u0642",2284:"\u0642",2285:"\u0643",2286:"\u0644",2287:"\u0645",2288:"\u0646",2291:"\u0647",2292:"\u064a",2293:"\u064a",2294:"\u0629",2295:"\u0649",2297:"\u0626",2306:"\u0626",2311:"\u0621",2312:"\u0622",2313:"\u0623",2314:"\u0624",2315:"\u0625",2316:"\u0626",2317:"\u0627",2318:"\u0628",2319:"\u0629",2320:"\u062a",2321:"\u062b",2322:"\u062c",2323:"\u062d",2324:"\u062e",2325:"\u062f",2326:"\u0630",2327:"\u0631",2328:"\u0632",2329:"\u0633",2330:"\u0634",2331:"\u0635",2332:"\u0636",2333:"\u0637",2334:"\u0638",2335:"\u0639",2336:"\u063a",2337:"\u0640",2338:"\u0641",2339:"\u0642",2340:"\u0643",2341:"\u0644",2342:"\u0645",2343:"\u0646",2344:"\u0647",2345:"\u0648",2346:"\u0649",2347:"\u064a",2359:"\u0653",2363:"\u066e",2364:"\u06a1",2365:"\u06a1",2366:"\u066e",2367:"\u0644",2393:"\u0644",2399:"\u06ba",2417:"\u0644\u0644\u0647",2428:"\u066f",2430:"\u0654",2504:"\u06a1",2627:"\u25cc",2659:"\u0627\u0644\u0644\u0647",2828:"\u0631",2829:"\u0632",3515:"\ufb00",3516:"\ufb03",3620:"\u0624",3621:"\u0626",3622:"\u0628",3623:"\u0628",3624:"\u062a",3625:"\u062a",3626:"\u062b",3627:"\u062b",3628:"\u062c",3629:"\u062d",3630:"\u062e",3631:"\u062f",3632:"\u0630",3633:"\u0633",3634:"\u0633",3635:"\u0634",3636:"\u0634",3637:"\u0635",3638:"\u0635",3639:"\u0636",3640:"\u0636",3641:"\u0637",3642:"\u0637",3643:"\u0637",3644:"\u0638",3645:"\u0638",3646:"\u0638",3667:"\u0641",3668:"\u0642",3669:"\u0643",3670:"\u0643",3671:"\u0645",3672:"\u0645",3673:"\u0646",3674:"\u0646",3675:"\u0647",3676:"\u0647",3677:"\u0647",3678:"\u0648",3679:"\u0649",3680:"\u0649",3681:"\u064a",3694:"\u066e",3695:"\u066e",3696:"\u066f",3697:"\u066f",3698:"\u066f",3749:"\u06a1",3791:"\u06ba",3938:"\u0622",3939:"\u0623",3940:"\u0625",3941:"\u0627",3948:"\u0633",3949:"\u0633",3950:"\u0634",3951:"\u0634",3970:"\u0635",3971:"\u0635",3972:"\u0636",3973:"\u0636",3980:"\u0644",3981:"\u0644",3992:"\u0631",3993:"\u0632",4007:"\u0626",4011:"\u0649",4012:"\u064a",4486:"\u2009",5103:"\u0645\u062d\u0645\u062f",5104:"\u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064a\u0647 \u0648\u0633\u0644\u0645",5105:"\u062c\u0644 \u062c\u0644\u0627\u0644\u0647",5106:"\ufdfd",5271:"\u0641\u0644\u0644\u0647"};
const ARIAL_TABLE={3:" ",5:"\"",29:":",39:"D",48:"M",53:"R",71:"d",85:"r",748:"\u060c",751:"\u0621",752:"\u0640",776:"\u06d5",815:"\u06a9",821:"\u06cc",822:"\u06cc",896:"\u0621",897:"\u0622",898:"\u0622",899:"\u0623",900:"\u0623",901:"\u0624",902:"\u0624",903:"\u0625",904:"\u0625",905:"\u0626",906:"\u0626",907:"\u0626",908:"\u0626",909:"\u0627",910:"\u0627",911:"\u0628",912:"\u0628",913:"\u0628",914:"\u0628",915:"\u0629",916:"\u0629",917:"\u062a",918:"\u062a",919:"\u062a",920:"\u062a",921:"\u062b",922:"\u062b",923:"\u062b",924:"\u062b",925:"\u062c",926:"\u062c",927:"\u062c",928:"\u062c",929:"\u062d",930:"\u062d",931:"\u062d",932:"\u062d",933:"\u062e",934:"\u062e",935:"\u062e",936:"\u062e",937:"\u062f",938:"\u062f",939:"\u0630",940:"\u0630",941:"\u0631",942:"\u0631",943:"\u0632",944:"\u0632",945:"\u0633",946:"\u0633",947:"\u0633",948:"\u0633",949:"\u0634",950:"\u0634",951:"\u0634",952:"\u0634",953:"\u0635",954:"\u0635",955:"\u0635",956:"\u0635",957:"\u0636",958:"\u0636",959:"\u0636",960:"\u0636",961:"\u0637",962:"\u0637",963:"\u0637",964:"\u0637",965:"\u0638",966:"\u0638",967:"\u0638",968:"\u0638",969:"\u0639",970:"\u0639",971:"\u0639",972:"\u0639",973:"\u063a",974:"\u063a",975:"\u063a",976:"\u063a",977:"\u0641",978:"\u0641",979:"\u0641",980:"\u0641",981:"\u0642",982:"\u0642",983:"\u0642",984:"\u0642",985:"\u0643",986:"\u0643",987:"\u0643",988:"\u0643",989:"\u0644",990:"\u0644",991:"\u0644",992:"\u0644",993:"\u0645",994:"\u0645",995:"\u0645",996:"\u0645",997:"\u0646",998:"\u0646",999:"\u0646",1000:"\u0646",1001:"\u0647",1002:"\u0647",1003:"\u0647",1004:"\u0647",1005:"\u0648",1006:"\u0648",1007:"\u0649",1008:"\u0649",1009:"\u064a",1010:"\u064a",1011:"\u064a",1012:"\u064a",1013:"\u0644\u0622",1014:"\u0644\u0622",1015:"\u0644\u0623",1016:"\u0644\u0623",1017:"\u0644\u0625",1018:"\u0644\u0625",1019:"\u0644\u0627",1020:"\u0644\u0627",1320:"\u066e",1321:"\u0649",1325:"\ufbb3",1326:"\ufbb5",1327:"\ufbb7",1336:"\u0653",1338:"\u0655",1466:"\u06a1",1567:"\u06c1",1643:"\u06c1",1644:"\u06c1",3021:"\u0631\u06cc\u0627\u0644",3869:"\u0645\u062d\u0645\u062f"};
/* ===== CardsCore: قراءة الكشوف (PDF / جداول) وتحويلها إلى بيانات موحّدة ===== */

/* ---------- نصوص عربية ---------- */
const AR_RE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
function normAr(s) {
  return String(s == null ? '' : s)
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[‎‏‪-‮]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}
function cleanText(s) {
  return String(s == null ? '' : s).replace(/[‎‏‪-‮\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
}
function isSaneChar(ch) {
  const c = ch.codePointAt(0);
  return (c >= 0x20 && c <= 0x7E) || c === 0xA0 || (c >= 0x600 && c <= 0x6FF) || (c >= 0x750 && c <= 0x77F) ||
    (c >= 0xFB50 && c <= 0xFDFF) || (c >= 0xFE70 && c <= 0xFEFF) || (c >= 0x2000 && c <= 0x206F) || (c >= 0xC0 && c <= 0x24F);
}

/* تحويل ترتيب الرسم (يسار→يمين) إلى الترتيب المنطقي للنص العربي */
function visualToLogical(parts) {
  const rev = parts.slice().reverse();
  const out = [];
  let i = 0;
  const isLtrPart = (p) => !AR_RE.test(p) && /[0-9A-Za-z]/.test(p);
  while (i < rev.length) {
    if (isLtrPart(rev[i])) {
      let j = i;
      while (j < rev.length && (isLtrPart(rev[j]) || /^[!-\/:-@\[-`{-~]$/.test(rev[j]))) j++;
      out.push(...rev.slice(i, j).reverse());
      i = j;
    } else { out.push(rev[i]); i++; }
  }
  return out.join('');
}

function fontKindOf(font) {
  const n = (font && font.name) || '';
  if (!font || !font.composite) return null;
  if (/segoe/i.test(n)) return 'segoe';
  if (/arial/i.test(n)) return 'arial';
  return null;
}

function decodeRun(glyphs, kind) {
  const real = glyphs.filter((g) => g && typeof g === 'object');
  if (!real.length) return { text: '', bad: 0 };
  const insane = real.some((g) => {
    const u = g.unicode;
    return typeof u !== 'string' || !u.length || [...u].some((ch) => !isSaneChar(ch));
  });
  let parts = [], bad = 0;
  if (insane) {
    const table = kind === 'segoe' ? SEGOE_TABLE : kind === 'arial' ? ARIAL_TABLE : null;
    for (const g of real) {
      let s = table ? table[g.originalCharCode] : undefined;
      if (s === undefined) {
        const u = g.unicode;
        if (typeof u === 'string' && u.length && [...u].every(isSaneChar)) s = u; else { s = '\uFFFD'; bad++; }
      }
      parts.push(s);
    }
  } else {
    parts = real.map((g) => g.unicode);
  }
  const joined = parts.join('');
  const text = AR_RE.test(joined) ? visualToLogical(parts) : joined;
  return { text, bad };
}

/* ---------- مصفوفات ---------- */
const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/* ---------- استخراج مقاطع النص من صفحة PDF (مع حدود الخلية من قصّ الرسم) ---------- */
async function extractRuns(page, OPS) {
  const ol = await page.getOperatorList();
  const fnA = ol.fnArray, argA = ol.argsArray;
  const I = [1, 0, 0, 1, 0, 0];
  let ctm = I, clip = null, pendingRect = null;
  const stack = [];
  let tm = I, tlm = I, leading = 0, fontId = null, fontSize = 1, kind = null;
  const kindCache = {};
  const runs = [];
  const kindFor = (id) => {
    if (id in kindCache) return kindCache[id];
    let k = null;
    try { k = fontKindOf(page.commonObjs.get(id)); } catch (e) { k = null; }
    return (kindCache[id] = k);
  };
  const show = (glyphs) => {
    const trm = mul(tm, ctm);
    const [x, y] = apply(trm, 0, 0);
    const scale = Math.hypot(trm[0], trm[1]) || 1;
    let w = 0;
    for (const g of glyphs) if (g && typeof g === 'object') w += (g.width || 0);
    const wUser = (w / 1000) * fontSize * scale;
    const dec = decodeRun(glyphs, kind);
    runs.push({ text: dec.text, bad: dec.bad, x0: x, x1: x + wUser, y, size: fontSize * scale, clip });
    tm = mul([1, 0, 0, 1, (w / 1000) * fontSize, 0], tm);
  };
  for (let i = 0; i < fnA.length; i++) {
    const fn = fnA[i], a = argA[i];
    switch (fn) {
      case OPS.save: stack.push({ ctm, clip }); break;
      case OPS.restore: { const s = stack.pop(); if (s) { ctm = s.ctm; clip = s.clip; } break; }
      case OPS.transform: ctm = mul(a, ctm); break;
      case OPS.constructPath: {
        const ops = a[0], args = a[1];
        pendingRect = null;
        if (ops.length === 1 && ops[0] === OPS.rectangle) {
          const [rx, ry, rw, rh] = args;
          const p1 = apply(ctm, rx, ry), p2 = apply(ctm, rx + rw, ry + rh);
          pendingRect = { x0: Math.min(p1[0], p2[0]), x1: Math.max(p1[0], p2[0]), y0: Math.min(p1[1], p2[1]), y1: Math.max(p1[1], p2[1]) };
        }
        break;
      }
      case OPS.clip: case OPS.eoClip: if (pendingRect) clip = pendingRect; break;
      case OPS.endPath: pendingRect = null; break;
      case OPS.beginText: tm = I; tlm = I; break;
      case OPS.setFont: fontId = a[0]; fontSize = a[1]; kind = kindFor(fontId); break;
      case OPS.setLeading: leading = a[0]; break;
      case OPS.moveText: tlm = mul([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm; break;
      case OPS.setLeadingMoveText: leading = -a[1]; tlm = mul([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm; break;
      case OPS.setTextMatrix: tlm = a.slice(0, 6); tm = tlm; break;
      case OPS.nextLine: tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; break;
      case OPS.showText: show(a[0]); break;
      case OPS.showSpacedText: show(a[0]); break;
      case OPS.nextLineShowText: tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; show(a[0]); break;
      case OPS.nextLineSetSpacingShowText: tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; show(a[2]); break;
      default: break;
    }
  }
  return runs;
}

/* ---------- من المقاطع إلى خلايا ثم صفوف وأعمدة ---------- */
function runsToCells(runs) {
  const map = new Map(), cells = [];
  for (const r of runs) {
    if (!cleanText(r.text)) continue;
    if (r.clip) {
      const k = [r.clip.x0, r.clip.x1, r.clip.y0, r.clip.y1].map((v) => Math.round(v * 10)).join('|');
      let c = map.get(k);
      if (!c) { c = { x0: r.clip.x0, x1: r.clip.x1, y0: r.clip.y0, y1: r.clip.y1, boxed: true, parts: [], bad: 0 }; map.set(k, c); cells.push(c); }
      c.parts.push(r); c.bad += r.bad;
    } else {
      cells.push({ x0: r.x0, x1: Math.max(r.x1, r.x0 + 1), y0: r.y - r.size * 0.25, y1: r.y + r.size * 0.85, boxed: false, parts: [r], bad: r.bad });
    }
  }
  for (const c of cells) {
    const ps = c.parts.slice().sort((p, q) => (Math.abs(q.y - p.y) > 2 ? q.y - p.y : q.x0 - p.x0));
    c.text = cleanText(ps.map((p) => p.text).join(' '));
    c.cy = (c.y0 + c.y1) / 2;
  }
  return cells.filter((c) => c.text);
}

function clusterRows(cells) {
  const hs = cells.filter((c) => c.boxed).map((c) => c.y1 - c.y0).sort((a, b) => a - b);
  const medH = hs.length ? hs[Math.floor(hs.length / 2)] : 10;
  const tol = Math.max(2, medH * 0.35);
  const sorted = cells.slice().sort((a, b) => b.cy - a.cy);
  const rows = [];
  for (const c of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.cy - c.cy) <= tol) { last.cells.push(c); last.cy = (last.cy * (last.cells.length - 1) + c.cy) / last.cells.length; }
    else rows.push({ cy: c.cy, cells: [c] });
  }
  rows.forEach((r) => r.cells.sort((a, b) => b.x0 - a.x0));
  return rows;
}

const HEADER_WORDS = ['اسم', 'الاسم', 'كود', 'المستخدم', 'كلمه المرور', 'كلمه السر', 'الرقم', 'المسلسل', 'الصف', 'الفصل', 'رقم', 'التوقيع', 'تاريخ', 'الطالب', 'التلميذ', 'الباسورد', 'password', 'username', 'name', 'id', 'code', 'class', 'user'];
function headerScore(cellsOrTexts) {
  let n = 0;
  for (const t of cellsOrTexts) {
    const s = normAr(typeof t === 'string' ? t : t.text);
    if (!s) continue;
    if (s === 'م' || HEADER_WORDS.some((w) => s === w || s.includes(w))) n++;
  }
  return n;
}

function overlap(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }

function buildColumns(headerCells) {
  // أعمدة الجدول تُشتق من خلايا صف العناوين فقط (حدود القصّ إن وُجدت، وإلا منتصفات النص)
  const hs = headerCells.slice().sort((a, b) => b.x0 - a.x0); // من اليمين لليسار
  const cols = hs.map((c) => ({ x0: c.x0, x1: c.x1, boxed: c.boxed, cx: (c.x0 + c.x1) / 2 }));
  for (let i = 0; i < cols.length; i++) {
    if (cols[i].boxed) continue;
    const right = i > 0 ? (cols[i - 1].cx + cols[i].cx) / 2 : cols[i].x1 + 40;
    const left = i < cols.length - 1 ? (cols[i + 1].cx + cols[i].cx) / 2 : cols[i].x0 - 40;
    cols[i].x0 = left; cols[i].x1 = right;
  }
  return cols;
}
function colIndex(cols, cell) {
  const cx = (cell.x0 + cell.x1) / 2;
  let best = -1, bd = Infinity;
  cols.forEach((c, i) => {
    const inside = cx >= c.x0 - 0.5 && cx <= c.x1 + 0.5;
    const d = inside ? 0 : Math.min(Math.abs(cx - c.x0), Math.abs(cx - c.x1));
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

function pageMeta(rowsAbove) {
  const meta = { fields: {}, title: '', url: '' };
  const longTexts = [];
  for (const r of rowsAbove) {
    const cs = r.cells.slice().sort((a, b) => b.x0 - a.x0); // يمين → يسار
    cs.forEach((c, i) => {
      let t = c.text;
      const m = t.match(/https?:\/\/\S+/i);
      if (m) { meta.url = m[0]; t = cleanText(t.replace(m[0], '')); }
      if (/[:：]$/.test(t)) {
        const label = cleanText(t.replace(/[:：]$/, ''));
        let val = null;
        for (let j = i + 1; j < cs.length; j++) { if (!/[:：]$/.test(cs[j].text)) { val = cs[j]; break; } else break; }
        if (label && val) meta.fields[label] = val.text;
      } else if (t) longTexts.push(t);
    });
  }
  const used = new Set(Object.values(meta.fields));
  const cand = longTexts.filter((t) => !used.has(t) && t.length > 12).sort((a, b) => b.length - a.length);
  if (cand.length) meta.title = cand[0];
  return meta;
}

function uniqueKeys(labels) {
  const seen = {};
  return labels.map((l, i) => {
    let k = cleanText(l) || ('عمود ' + (i + 1));
    if (seen[k]) { seen[k]++; k = k + ' ' + seen[k]; } else seen[k] = 1;
    return k;
  });
}

function pageToTable(cells, prev) {
  const rows = clusterRows(cells);
  let hi = -1, best = 1;
  rows.forEach((r, i) => { const s = headerScore(r.cells); if (s > best) { best = s; hi = i; } });
  let cols, keys, body, meta;
  if (hi >= 0) {
    const hdr = rows[hi];
    const afterRows = rows.slice(hi + 1);
    cols = buildColumns(hdr.cells);
    const labels = new Array(cols.length).fill('');
    hdr.cells.forEach((c) => { const ix = colIndex(cols, c); if (ix >= 0) labels[ix] = labels[ix] ? labels[ix] + ' ' + c.text : c.text; });
    keys = uniqueKeys(labels);
    body = afterRows;
    meta = pageMeta(rows.slice(0, hi));
  } else if (prev) {
    cols = prev.cols; keys = prev.keys; body = rows; meta = { fields: {}, title: '', url: '' };
  } else return null;

  const recs = [];
  const counts = body.slice(0, 4).map((r) => r.cells.length).filter((n) => n >= 2);
  const typical = counts.length ? counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)] : 2;
  const need = Math.max(2, Math.ceil(typical * 0.8));
  for (const r of body) {
    if (r.cells.length >= need) {
      const rec = {};
      keys.forEach((k) => (rec[k] = ''));
      let bad = 0;
      r.cells.forEach((c) => { const ix = colIndex(cols, c); if (ix >= 0) { rec[keys[ix]] = rec[keys[ix]] ? rec[keys[ix]] + ' ' + c.text : c.text; bad += c.bad; } });
      rec.__bad = bad;
      recs.push(rec);
    } else if (recs.length && r.cells.length <= 2 && !r.cells.some((c) => c.boxed)) {
      const rec = recs[recs.length - 1];
      r.cells.forEach((c) => { const ix = colIndex(cols, c); if (ix >= 0) rec[keys[ix]] = (rec[keys[ix]] + ' ' + c.text).trim(); });
    } else if (recs.length) break;
  }
  return { cols, keys, recs, meta };
}

/* ---------- قراءة ملف PDF كامل ---------- */
async function parsePdf(pdfjsLib, data, onProgress) {
  const doc = await pdfjsLib.getDocument({ data, verbosity: 0 }).promise;
  const OPS = pdfjsLib.OPS;
  let prev = null, all = [], meta = { title: '', url: '' }, bad = 0, pagesWithTable = 0;
  const metaKeys = [];
  for (let p = 1; p <= doc.numPages; p++) {
    if (onProgress) onProgress(p, doc.numPages);
    const page = await doc.getPage(p);
    const runs = await extractRuns(page, OPS);
    const cells = runsToCells(runs);
    const t = pageToTable(cells, prev);
    if (!t) continue;
    prev = t; pagesWithTable++;
    if (t.meta.title && !meta.title) meta.title = t.meta.title;
    if (t.meta.url && !meta.url) meta.url = t.meta.url;
    const fields = t.meta.fields;
    Object.keys(fields).forEach((k) => { if (!metaKeys.includes(k)) metaKeys.push(k); });
    t.recs.forEach((rec) => {
      bad += rec.__bad || 0;
      metaKeys.forEach((k) => { if (!(k in rec) && fields[k] !== undefined) rec[k] = fields[k]; });
      rec.__page = p;
      all.push(rec);
    });
  }
  const columns = [];
  all.forEach((r) => Object.keys(r).forEach((k) => { if (!k.startsWith('__') && !columns.includes(k)) columns.push(k); }));
  all.forEach((r) => columns.forEach((k) => { if (r[k] === undefined) r[k] = ''; }));
  return { columns, rows: all, meta, badGlyphs: bad, pages: doc.numPages, pagesWithTable };
}

/* ---------- جداول عامة (Excel / CSV / لصق): اختيار صف العناوين تلقائيًا ---------- */
function tableFromMatrix(matrix) {
  const rows = matrix.map((r) => r.map((v) => cleanText(v))).filter((r) => r.some((v) => v));
  if (!rows.length) return { columns: [], rows: [], meta: {} };
  let hi = 0, best = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const s = headerScore(rows[i]);
    const filled = rows[i].filter((v) => v).length;
    const sc = s * 10 + filled;
    if (sc > best) { best = sc; hi = i; }
  }
  if (headerScore(rows[hi]) === 0) hi = rows.findIndex((r) => r.filter((v) => v).length >= 2);
  if (hi < 0) hi = 0;
  const width = Math.max(...rows.slice(hi).map((r) => r.length));
  const labels = [];
  for (let i = 0; i < width; i++) labels.push(rows[hi][i] || '');
  const keys = uniqueKeys(labels);
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const rec = {};
    keys.forEach((k, i) => (rec[k] = r[i] || ''));
    if (Object.values(rec).filter((v) => v).length >= 2) out.push(rec);
  }
  return { columns: keys, rows: out, meta: {} };
}

function parseDelimited(text) {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const delim = firstLine.includes('\t') ? '\t' : (firstLine.split(';').length > firstLine.split(',').length ? ';' : ',');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch === '\r') { /* skip */ }
    else cur += ch;
  }
  row.push(cur); rows.push(row);
  return rows;
}

/* ---------- اكتشاف أدوار الأعمدة ---------- */
function detectRoles(columns) {
  const roles = {};
  const take = (role, test, exclude) => {
    if (roles[role]) return;
    const hit = columns.find((c) => { const n = normAr(c); return test.test(n) && !(exclude && exclude.test(n)) && !Object.values(roles).includes(c); });
    if (hit) roles[role] = hit;
  };
  take('pass', /كلمه المرور|كلمه السر|الباسورد|الرقم السري|password|pass|pwd/);
  take('user', /المستخدم|اسم الدخول|username|user name|^user$|login|يوزر/);
  take('name', /اسم الطالب|اسم التلميذ|^الاسم$|الاسم|اسم|student name|^name$/, /مستخدم|دخول|user/);
  take('code', /كود الطالب|الكود|كود|الرقم الكودي|رقم الطالب|الرقم القومي|رقم الجلوس|^id$|code/, /مستخدم/);
  take('grade', /الصف|الفصل|المرحله الدراسيه|class|grade/);
  take('school', /المدرسه|school/);
  take('no', /^م$|^مسلسل$|المسلسل|^#$|^no$|^serial$/);
  return roles;
}

const CardsCore = { parsePdf, tableFromMatrix, parseDelimited, detectRoles, normAr, cleanText, decodeRun, visualToLogical, runsToCells, clusterRows };


;
/* === Inline Script Block #6 (executable) === */

(function () {
'use strict';
const $ = (s) => document.querySelector(s);
const AR = /[؀-ۿ]/;
const F_UI = '"IBM Plex Sans Arabic","Segoe UI",Tahoma,Arial,sans-serif';
const F_MONO = '"IBM Plex Mono","Courier New",Consolas,monospace';
const LIBS = {
  pdf: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  pdfWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
};
const THEMES = {
  teal: { name: 'أخضر مزرق', main: '#0e6b5c', tint: '#e4f1ee', edge: '#b4d3cc' },
  navy: { name: 'كحلي', main: '#1f3a68', tint: '#e7edf8', edge: '#bccbe6' },
  maroon: { name: 'عنابي', main: '#85203b', tint: '#f6e7eb', edge: '#e2bcc6' },
  gold: { name: 'ذهبي', main: '#8f6200', tint: '#f8efd8', edge: '#e3d0a0' },
  slate: { name: 'رمادي', main: '#323c46', tint: '#e9ecef', edge: '#c5ccd3' },
};
const LAYOUTS = {
  '2x4': { cols: 2, rows: 4, label: '٨ بطاقات (2×4)' },
  '2x5': { cols: 2, rows: 5, label: '١٠ بطاقات (2×5)' },
  '2x3': { cols: 2, rows: 3, label: '٦ بطاقات كبيرة (2×3)' },
  '3x5': { cols: 3, rows: 5, label: '١٥ بطاقة صغيرة (3×5)' },
  '1x2': { cols: 1, rows: 2, label: 'بطاقتان في الصفحة' },
  '1x1': { cols: 1, rows: 1, label: 'بطاقة بكامل الصفحة' },
};
const PAGE = { w: 210, h: 297, margin: 8, gap: 4 };
const SAMPLE_SCHOOL = 'مدرسة النور النموذجية';
const SAMPLE_URL = 'https://platform.example.edu';

const state = {
  data: null, roles: {}, fields: [], sel: new Set(), page: 0, touched: {},
  settings: {
    school: '', title: 'بطاقة دخول المنصة', url: '', note: 'احتفظ بهذه البطاقة ولا تشاركها مع أحد.',
    theme: 'teal', layout: '2x4', border: 'solid', qr: true, colorChars: true, cleanNames: true, group: true,
    foot: true, receipt: false, dpi: 300, logo: null,
  },
};
let logoImg = null;
let qrCache = { url: '', modules: null };
let drawTimer = 0;

/* ---------- أدوات صغيرة ---------- */
const clean = (s) => CardsCore.cleanText(s);
const cleanName = (s) => clean(String(s || '').replace(/ـ/g, ''));
const isLtr = (s) => !AR.test(s);
function mode(arr) {
  const m = new Map(); let best = '', bc = 0;
  arr.forEach((v) => { if (!v) return; const c = (m.get(v) || 0) + 1; m.set(v, c); if (c > bc) { bc = c; best = v; } });
  return best;
}
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('تعذّر تحميل مكتبة القراءة. تأكد من الاتصال بالإنترنت.'));
    document.head.appendChild(s);
  });
}
async function ensurePdfLib() {
  if (!window.pdfjsLib) await loadScript('pdf.min.js');
  if (window.pdfjsLib.PDFWorkerUtil && window.pdfjsWorker) {
    window.pdfjsLib.PDFWorkerUtil.isWorkerDisabled = true;
  }
  if (window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.js';
  }
}
async function ensureXlsx() { if (!window.XLSX) await loadScript(LIBS.xlsx); }
const save = () => { try { const o = Object.assign({}, state.settings); delete o.logo; localStorage.setItem('cards.settings.v1', JSON.stringify(o)); } catch (e) { /* التخزين غير متاح */ } };
function load() {
  try {
    const o = JSON.parse(localStorage.getItem('cards.settings.v1') || 'null');
    if (o) Object.keys(o).forEach((k) => { if (k in state.settings && k !== 'logo') state.settings[k] = o[k]; });
  } catch (e) { /* تجاهل */ }
}
function notice(kind, text) {
  const n = $('#notice');
  if (!text) { n.hidden = true; return; }
  n.hidden = false; n.className = 'notice ' + (kind || ''); n.textContent = text;
}
function fixTitle(t) { return String(t || '').replace(/الإصطناعي/g, 'الاصطناعي'); }

/* ---------- قراءة الملفات ---------- */
async function readPdf(file) {
  await ensurePdfLib();
  const buf = new Uint8Array(await file.arrayBuffer());
  const res = await CardsCore.parsePdf(window.pdfjsLib, buf, (p, n) => notice('', 'جارٍ قراءة الصفحة ' + p + ' من ' + n + '…'));
  if (!res.rows.length) throw new Error('لم أجد جدول طلاب داخل هذا الـ PDF. إن كان صورة ممسوحة فاستخدم نسخة Excel من الكشف.');
  return res;
}
async function readWorkbook(file) {
  await ensureXlsx();
  const wb = window.XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const parts = [];
  wb.SheetNames.forEach((name) => {
    const m = window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
    const t = CardsCore.tableFromMatrix(m);
    if (t.rows.length) parts.push({ name, t });
  });
  if (!parts.length) throw new Error('لم أجد بيانات طلاب في هذا الملف.');
  if (parts.length === 1) return parts[0].t;
  const columns = [];
  const rows = [];
  parts.forEach((p) => p.t.columns.forEach((c) => { if (!columns.includes(c)) columns.push(c); }));
  parts.forEach((p) => p.t.rows.forEach((r) => { const o = {}; columns.forEach((c) => (o[c] = r[c] || '')); o['الورقة'] = p.name; rows.push(o); }));
  columns.push('الورقة');
  return { columns, rows, meta: {} };
}
async function readText(file) {
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('\uFFFD')) { try { text = new TextDecoder('windows-1256').decode(buf); } catch (e) { /* تجاهل */ } }
  return CardsCore.tableFromMatrix(CardsCore.parseDelimited(text));
}
async function ingestFile(file) {
  if (!file) return;
  notice('', 'جارٍ قراءة ' + file.name + '…');
  try {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    let d;
    if (ext === 'pdf') d = await readPdf(file);
    else if (['xlsx', 'xls', 'xlsm', 'xlsb', 'ods'].includes(ext)) d = await readWorkbook(file);
    else d = await readText(file);
    if (!d.rows.length) throw new Error('لم أجد صفوف طلاب في الملف.');
    applyData(d, file.name, false);
  } catch (e) {
    notice('error', 'تعذّرت قراءة الملف: ' + (e && e.message ? e.message : e));
  }
}

/* ---------- تطبيق البيانات ---------- */
function guessNameColumn(data) {
  let best = null, bs = -1;
  data.columns.forEach((c) => {
    const vals = data.rows.slice(0, 40).map((r) => clean(r[c]));
    const sc = vals.filter((v) => AR.test(v) && v.split(' ').length >= 2).length;
    if (sc > bs) { bs = sc; best = c; }
  });
  return best;
}
function applyData(d, label, sample) {
  const s = state.settings;
  state.data = { columns: d.columns.slice(), rows: d.rows, meta: d.meta || {}, label, sample, bad: d.badGlyphs || 0, pages: d.pages || 0 };
  state.roles = CardsCore.detectRoles(d.columns);
  if (!state.roles.name) state.roles.name = guessNameColumn(state.data);
  state.sel = new Set(d.rows.map((_, i) => i));
  state.page = 0;
  // قيم مأخوذة من الكشف ما لم يعدّلها المستخدم بنفسه
  const schoolCol = state.roles.school;
  const school = schoolCol ? mode(d.rows.map((r) => clean(r[schoolCol]))) : '';
  if (!state.touched.school) s.school = sample ? SAMPLE_SCHOOL : (school || '');
  const meta = d.meta || {};
  if (!state.touched.url) s.url = sample ? SAMPLE_URL : (meta.url || '');
  if (!state.touched.title && !sample) {
    const t = fixTitle(meta.title || '');
    const i = t.indexOf('منصة');
    s.title = i >= 0 ? 'بطاقة دخول ' + t.slice(i) : 'بطاقة دخول المنصة';
  }
  initFields();
  syncSettingsUi();
  renderRoleSelects();
  renderFields();
  renderGradeFilter();
  renderTable();
  $('#sampleChip').hidden = !sample;
  const si = $('#srcInfo');
  si.textContent = '';
  if (sample) si.textContent = 'بيانات نموذجية للتجربة';
  else { si.append(d.rows.length + ' طالب من '); const bd = document.createElement('bdi'); bd.textContent = label; si.appendChild(bd); }
  if (sample) notice('', '');
  else if (state.data.bad > 0) notice('warn', 'لم يُقرأ ' + state.data.bad + ' حرفًا من الأسماء بشكل صحيح. الصفوف المعلَّمة بالأحمر في جدول الطلاب تحتاج مراجعة وتعديل.');
  else notice('ok', 'تمت قراءة ' + d.rows.length + ' طالب' + (d.pages ? ' من ' + d.pages + ' صفحة' : '') + '. راجع البطاقة في المعاينة ثم نزّل الملف.');
  schedule();
}
function initFields() {
  const d = state.data, r = state.roles;
  const rows = d.rows;
  const codesSame = r.code && r.user && rows.every((x) => clean(x[r.code]) === clean(x[r.user]));
  const primary = [r.user, r.pass, r.code].filter(Boolean);
  const order = d.columns.filter((c) => c !== r.name);
  order.sort((a, b) => {
    const pa = primary.indexOf(a), pb = primary.indexOf(b);
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
  });
  const labels = { [r.user]: 'اسم المستخدم', [r.pass]: 'كلمة المرور', [r.code]: 'كود الطالب' };
  let on = new Set([r.user, r.pass].filter(Boolean));
  if (r.code && !codesSame) on.add(r.code);
  if (!on.size) order.filter((c) => rows.some((x) => clean(x[c]))).slice(0, 3).forEach((c) => on.add(c));
  state.fields = order.map((c) => ({ col: c, label: labels[c] || c, on: on.has(c) }));
}

/* ---------- واجهة الإعدادات ---------- */
function syncSettingsUi() {
  const s = state.settings;
  $('#sSchool').value = s.school; $('#sTitle').value = s.title; $('#sUrl').value = s.url; $('#sNote').value = s.note;
  $('#sLayout').value = s.layout; $('#sBorder').value = s.border; $('#sDpi').value = String(s.dpi);
  $('#sQr').checked = s.qr; $('#sColor').checked = s.colorChars; $('#sClean').checked = s.cleanNames;
  $('#sGroup').checked = s.group; $('#sFoot').checked = s.foot; $('#sReceipt').checked = s.receipt;
  document.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === s.theme)));
  $('#btnLogoRm').hidden = !s.logo;
  $('#btnLogo').textContent = s.logo ? 'تغيير الشعار' : 'إضافة شعار المدرسة';
}
function bindSettings() {
  const s = state.settings;
  const text = (id, key) => $(id).addEventListener('input', (e) => { s[key] = e.target.value; state.touched[key] = true; save(); schedule(); });
  text('#sSchool', 'school'); text('#sTitle', 'title'); text('#sUrl', 'url'); text('#sNote', 'note');
  const chk = (id, key) => $(id).addEventListener('change', (e) => { s[key] = e.target.checked; save(); state.page = 0; schedule(); });
  chk('#sQr', 'qr'); chk('#sColor', 'colorChars'); chk('#sClean', 'cleanNames'); chk('#sGroup', 'group'); chk('#sFoot', 'foot'); chk('#sReceipt', 'receipt');
  $('#sLayout').addEventListener('change', (e) => { s.layout = e.target.value; state.page = 0; save(); schedule(); });
  $('#sBorder').addEventListener('change', (e) => { s.border = e.target.value; save(); schedule(); });
  $('#sDpi').addEventListener('change', (e) => { s.dpi = Number(e.target.value); save(); });
  const sw = $('#swatches');
  Object.keys(THEMES).forEach((k) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch'; b.dataset.k = k; b.title = THEMES[k].name; b.setAttribute('aria-label', THEMES[k].name);
    b.style.background = THEMES[k].main;
    b.addEventListener('click', () => { s.theme = k; save(); syncSettingsUi(); schedule(); });
    sw.appendChild(b);
  });
  const lay = $('#sLayout');
  Object.keys(LAYOUTS).forEach((k) => { const o = document.createElement('option'); o.value = k; o.textContent = LAYOUTS[k].label; lay.appendChild(o); });
  $('#btnLogo').addEventListener('click', () => $('#logoFile').click());
  $('#logoFile').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => { s.logo = fr.result; setLogo(); syncSettingsUi(); schedule(); };
    fr.readAsDataURL(f);
    e.target.value = '';
  });
  $('#btnLogoRm').addEventListener('click', () => { s.logo = null; logoImg = null; syncSettingsUi(); schedule(); });
}
function setLogo() {
  const s = state.settings;
  if (!s.logo) { logoImg = null; return; }
  const im = new Image();
  im.onload = () => { logoImg = im; schedule(); };
  im.src = s.logo;
}
function renderRoleSelects() {
  const cols = state.data.columns;
  const mk = (sel, val, withNone) => {
    sel.innerHTML = '';
    if (withNone) { const o = document.createElement('option'); o.value = ''; o.textContent = '— بدون —'; sel.appendChild(o); }
    cols.forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
    sel.value = val || '';
  };
  mk($('#selName'), state.roles.name, false);
  mk($('#selGrade'), state.roles.grade, true);
}
function renderFields() {
  const box = $('#fields');
  box.innerHTML = '';
  state.fields.forEach((f, i) => {
    const row = document.createElement('div'); row.className = 'field';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = f.on; cb.setAttribute('aria-label', 'إظهار ' + f.col);
    cb.addEventListener('change', () => { f.on = cb.checked; schedule(); });
    const inp = document.createElement('input'); inp.type = 'text'; inp.value = f.label; inp.setAttribute('aria-label', 'عنوان ' + f.col);
    inp.addEventListener('input', () => { f.label = inp.value; schedule(); });
    const mv = document.createElement('div'); mv.className = 'mv';
    const up = document.createElement('button'); up.type = 'button'; up.className = 'small'; up.textContent = '↑'; up.setAttribute('aria-label', 'تحريك لأعلى'); up.disabled = i === 0;
    const dn = document.createElement('button'); dn.type = 'button'; dn.className = 'small'; dn.textContent = '↓'; dn.setAttribute('aria-label', 'تحريك لأسفل'); dn.disabled = i === state.fields.length - 1;
    const swap = (a, b) => { const t = state.fields[a]; state.fields[a] = state.fields[b]; state.fields[b] = t; renderFields(); schedule(); };
    up.addEventListener('click', () => swap(i, i - 1)); dn.addEventListener('click', () => swap(i, i + 1));
    mv.append(up, dn);
    row.append(cb, inp, mv);
    if (f.label !== f.col) { const cn = document.createElement('div'); cn.className = 'col-name'; cn.textContent = 'العمود: ' + f.col; row.appendChild(cn); }
    box.appendChild(row);
  });
}

/* ---------- جدول الطلاب ---------- */
function renderGradeFilter() {
  const sel = $('#gradeFilter');
  const g = state.roles.grade;
  const vals = g ? [...new Set(state.data.rows.map((r) => clean(r[g])).filter(Boolean))] : [];
  sel.innerHTML = '';
  const all = document.createElement('option'); all.value = ''; all.textContent = 'كل الصفوف'; sel.appendChild(all);
  vals.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
  sel.hidden = !vals.length;
}
function shownCols() {
  const r = state.roles;
  const cols = [r.name];
  state.fields.filter((f) => f.on).forEach((f) => { if (!cols.includes(f.col)) cols.push(f.col); });
  if (r.grade && !cols.includes(r.grade)) cols.push(r.grade);
  return cols.filter(Boolean);
}
function visibleIdx() {
  const q = CardsCore.normAr($('#q').value);
  const gv = $('#gradeFilter').value;
  const g = state.roles.grade;
  const cols = shownCols();
  const out = [];
  state.data.rows.forEach((row, i) => {
    if (gv && g && clean(row[g]) !== gv) return;
    if (q && !cols.some((c) => CardsCore.normAr(row[c]).includes(q))) return;
    out.push(i);
  });
  return out;
}
function renderTable() {
  const d = state.data, cols = shownCols();
  const thead = $('#tbl thead'), tbody = $('#tbl tbody');
  thead.innerHTML = '';
  const hr = document.createElement('tr');
  const th0 = document.createElement('th'); th0.textContent = '✓'; th0.style.width = '36px'; hr.appendChild(th0);
  const thn = document.createElement('th'); thn.textContent = '#'; hr.appendChild(thn);
  cols.forEach((c) => { const th = document.createElement('th'); th.textContent = c; hr.appendChild(th); });
  thead.appendChild(hr);
  tbody.innerHTML = '';
  const frag = document.createDocumentFragment();
  visibleIdx().forEach((i) => {
    const row = d.rows[i];
    const tr = document.createElement('tr'); if (!state.sel.has(i)) tr.className = 'off';
    const td0 = document.createElement('td');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = state.sel.has(i); cb.setAttribute('aria-label', 'تحديد الطالب ' + (i + 1));
    cb.addEventListener('change', () => { if (cb.checked) state.sel.add(i); else state.sel.delete(i); tr.className = cb.checked ? '' : 'off'; updateCounts(); schedule(); });
    td0.appendChild(cb); tr.appendChild(td0);
    const tdn = document.createElement('td'); tdn.textContent = String(i + 1); tdn.style.color = 'var(--muted)'; tr.appendChild(tdn);
    cols.forEach((c) => {
      const td = document.createElement('td');
      const v = row[c] == null ? '' : String(row[c]);
      td.textContent = v; td.contentEditable = 'true'; td.spellcheck = false;
      if (v && isLtr(v)) td.classList.add('mono');
      if (v.includes('\uFFFD')) td.classList.add('bad');
      td.addEventListener('input', () => { row[c] = td.textContent; td.classList.toggle('bad', td.textContent.includes('\uFFFD')); schedule(); });
      td.addEventListener('paste', (e) => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text').replace(/\s+/g, ' '); document.execCommand('insertText', false, t); });
      td.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); td.blur(); } });
      tr.appendChild(td);
    });
    frag.appendChild(tr);
  });
  tbody.appendChild(frag);
  updateCounts();
}
function updateCounts() {
  const n = state.sel.size, total = state.data.rows.length;
  $('#stuHint').textContent = 'المحدد ' + n + ' من ' + total;
}

/* ---------- نموذج البطاقة والصفحات ---------- */
function cardModel(rec) {
  const s = state.settings, r = state.roles;
  let name = clean(rec[r.name] || '');
  if (s.cleanNames) name = cleanName(name);
  const fields = [];
  state.fields.filter((f) => f.on).forEach((f) => {
    const v = clean(rec[f.col] || '');
    if (!v) return;
    fields.push({ label: clean(f.label) || f.col, value: v, kind: f.col === r.pass ? 'pass' : (isLtr(v) ? 'mono' : 'text') });
  });
  return { name, fields, grade: r.grade ? clean(rec[r.grade] || '') : '' };
}
function makePages() {
  const s = state.settings, d = state.data, L = LAYOUTS[s.layout] || LAYOUTS['2x4'];
  const per = L.cols * L.rows;
  const idx = [...state.sel].sort((a, b) => a - b);
  const g = state.roles.grade;
  const groups = [];
  if (s.group && g) {
    const m = new Map();
    idx.forEach((i) => { const k = clean(d.rows[i][g]) || ''; if (!m.has(k)) { m.set(k, []); groups.push({ name: k, idxs: m.get(k) }); } m.get(k).push(i); });
  } else groups.push({ name: '', idxs: idx });
  const pages = [];
  groups.forEach((grp) => { for (let i = 0; i < grp.idxs.length; i += per) pages.push({ group: grp.name, idxs: grp.idxs.slice(i, i + per) }); });
  return pages;
}

/* ---------- رسم النص والأشكال (وحدة التصميم: ملم، والنص يُرسم ×10 لدقة القياس) ---------- */
function setFont(ctx, w, size, fam) { ctx.font = (w || 400) + ' ' + (size * 10) + 'px ' + (fam || F_UI); }
function mw(ctx, text, w, size, fam) {
  ctx.save(); setFont(ctx, w, size, fam); ctx.direction = isLtr(text) ? 'ltr' : 'rtl';
  const v = ctx.measureText(text).width / 10; ctx.restore(); return v;
}
function tx(ctx, text, x, y, o) {
  ctx.save(); ctx.scale(0.1, 0.1);
  setFont(ctx, o.w, o.size, o.fam);
  ctx.direction = o.dir || (isLtr(text) ? 'ltr' : 'rtl');
  ctx.textAlign = o.align || 'right'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = o.color; if (o.alpha != null) ctx.globalAlpha = o.alpha;
  ctx.fillText(text, x * 10, y * 10);
  ctx.restore();
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}
function wrapName(ctx, text, maxW, size) {
  const words = text.split(' ').filter(Boolean);
  if (!words.length) return [''];
  if (mw(ctx, text, 700, size) <= maxW) return [text];
  let best = null;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
    const wa = mw(ctx, a, 700, size), wb = mw(ctx, b, 700, size), m = Math.max(wa, wb);
    if (m <= maxW && (!best || m < best.m)) best = { m, lines: [a, b] };
  }
  return best ? best.lines : null;
}
function qrModules(url) {
  if (qrCache.url === url) return qrCache.modules;
  let mods = null;
  try {
    if (url && window.qrcode) {
      const q = window.qrcode(0, 'M'); q.addData(url); q.make();
      const n = q.getModuleCount(); mods = [];
      for (let r = 0; r < n; r++) { const row = []; for (let c = 0; c < n; c++) row.push(q.isDark(r, c)); mods.push(row); }
    }
  } catch (e) { mods = null; }
  qrCache = { url, modules: mods };
  return mods;
}
function drawValue(ctx, f, x0, x1, cy, size, th, colorChars) {
  // x0..x1: حدود الخانة. القيمة تُكتب من اليسار (نص لاتيني) أو من اليمين (نص عربي)
  const chipW = x1 - x0;
  let sz = size;
  const fam = f.kind === 'text' ? F_UI : F_MONO, wt = f.kind === 'text' ? 600 : 600;
  while (sz > 2.4 && mw(ctx, f.value, wt, sz, fam) > chipW - 3) sz -= 0.2;
  if (f.kind === 'text') {
    tx(ctx, f.value, x1 - 1.6, cy + sz * 0.35, { size: sz, w: wt, color: '#15211d', align: 'right' });
    return;
  }
  if (f.kind === 'pass' && colorChars) {
    ctx.save(); setFont(ctx, wt, sz, fam); const cw = ctx.measureText('M').width / 10; ctx.restore();
    let x = x0 + 1.6;
    [...f.value].forEach((ch) => {
      const color = /[0-9]/.test(ch) ? '#0b5cad' : (/[A-Za-z]/.test(ch) ? '#15211d' : '#c0392b');
      tx(ctx, ch, x, cy + sz * 0.35, { size: sz, w: wt, fam, color, align: 'left', dir: 'ltr' });
      x += cw;
    });
    return;
  }
  tx(ctx, f.value, x0 + 1.6, cy + sz * 0.35, { size: sz, w: wt, fam, color: '#15211d', align: 'left', dir: 'ltr' });
}
function drawCard(ctx, c, W, H) {
  const s = state.settings, th = THEMES[s.theme] || THEMES.teal;
  const pad = 4, BAND = 13, FOOT = s.receipt ? 11.5 : 9.5;
  // الخلفية والإطار
  rr(ctx, 0, 0, W, H, 3); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.save(); rr(ctx, 0, 0, W, H, 3); ctx.clip();
  ctx.fillStyle = th.main; ctx.fillRect(0, 0, W, BAND);
  ctx.restore();
  // الشريط العلوي
  let rightX = W - pad;
  if (logoImg) {
    const b = 9.4;
    ctx.save(); rr(ctx, rightX - b, (BAND - b) / 2, b, b, 1.6); ctx.fillStyle = '#fff'; ctx.fill(); ctx.clip();
    const ar = logoImg.width / logoImg.height, bw = b - 1.2;
    let dw = bw, dh = bw; if (ar > 1) dh = bw / ar; else dw = bw * ar;
    ctx.drawImage(logoImg, rightX - b + (b - dw) / 2, (BAND - dh) / 2, dw, dh);
    ctx.restore();
    rightX -= b + 2.4;
  }
  const white = '#ffffff';
  const gradeText = c.grade;
  let leftLimit = pad;
  if (gradeText) {
    let gs = 3.1; while (gs > 2.2 && mw(ctx, gradeText, 600, gs) > 30) gs -= 0.2;
    const gw = mw(ctx, gradeText, 600, gs) + 5;
    ctx.save(); rr(ctx, pad, (BAND - 6.2) / 2, gw, 6.2, 3.1); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fill(); ctx.restore();
    tx(ctx, gradeText, pad + gw / 2, BAND / 2 + gs * 0.35, { size: gs, w: 600, color: white, align: 'center' });
    leftLimit = pad + gw + 2;
  }
  const bandW = rightX - leftLimit;
  if (s.school) {
    let z = 4.6; while (z > 3 && mw(ctx, s.school, 700, z) > bandW) z -= 0.2;
    tx(ctx, s.school, rightX, 5.6, { size: z, w: 700, color: white });
    let t = 3; while (t > 2.2 && mw(ctx, s.title, 500, t) > bandW) t -= 0.2;
    tx(ctx, s.title, rightX, 10.4, { size: t, w: 500, color: white, alpha: 0.88 });
  } else {
    let z = 4.4; while (z > 2.8 && mw(ctx, s.title, 700, z) > bandW) z -= 0.2;
    tx(ctx, s.title, rightX, BAND / 2 + z * 0.35, { size: z, w: 700, color: white });
  }
  // QR
  const url = clean(s.url);
  const mods = s.qr && url ? qrModules(url) : null;
  const top = BAND + 3, bottom = H - FOOT - 1.5;
  let q = 0;
  if (mods) q = Math.min(19, (bottom - top) * 0.62);
  const fw = W - pad * 2 - (mods ? q + 4 : 0);
  const rightEdge = W - pad;
  if (mods) {
    const qx = pad, qy = top + ((bottom - top) - q - 3) / 2 + 0.5;
    const n = mods.length, cell = q / (n + 2);
    ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(qx, qy, q, q);
    ctx.strokeStyle = th.edge; ctx.lineWidth = 0.25; ctx.strokeRect(qx, qy, q, q);
    ctx.fillStyle = '#15211d';
    for (let r = 0; r < n; r++) for (let cc = 0; cc < n; cc++) if (mods[r][cc]) ctx.fillRect(qx + (cc + 1) * cell, qy + (r + 1) * cell, cell + 0.02, cell + 0.02);
    ctx.restore();
    tx(ctx, 'افتح المنصة', qx + q / 2, qy + q + 2.8, { size: 2.5, w: 500, color: '#566660', align: 'center' });
  }
  // الاسم
  let ns = 5.8, lines = null;
  while (ns >= 3.6) { lines = wrapName(ctx, c.name, fw, ns); if (lines) break; ns -= 0.2; }
  if (!lines) { ns = 3.6; lines = [c.name]; while (mw(ctx, lines[0], 700, ns) > fw && lines[0].length > 4) lines[0] = lines[0].slice(0, -2); }
  const lh = ns * 1.42;
  let y = top + ns * 1.02;
  lines.forEach((ln) => { tx(ctx, ln, rightEdge, y, { size: ns, w: 700, color: '#15211d' }); y += lh; });
  const nameBottom = top + lh * lines.length + 0.6;
  // الحقول
  const n = c.fields.length;
  if (n) {
    const area = bottom - nameBottom;
    const rowH = Math.min(10.4, area / n);
    const lab = Math.max(2.3, Math.min(3.2, rowH * 0.32));
    const val = Math.max(3, Math.min(5.2, rowH * 0.56));
    const LW = Math.min(23, fw * 0.34);
    const chipX0 = rightEdge - fw, chipX1 = rightEdge - LW - 1.5;
    c.fields.forEach((f, i) => {
      const cy = nameBottom + rowH * i + rowH / 2;
      let ls = lab; while (ls > 2.1 && mw(ctx, f.label, 500, ls) > LW) ls -= 0.2;
      tx(ctx, f.label, rightEdge, cy + ls * 0.35, { size: ls, w: 500, color: '#566660' });
      const chH = Math.min(rowH - 1.2, val + 3.2);
      ctx.save(); rr(ctx, chipX0, cy - chH / 2, chipX1 - chipX0, chH, 1.4); ctx.fillStyle = th.tint; ctx.fill(); ctx.restore();
      drawValue(ctx, f, chipX0, chipX1, cy, val, th, s.colorChars);
    });
  }
  // التذييل
  const fy = H - FOOT;
  ctx.save(); ctx.strokeStyle = th.edge; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.moveTo(pad, fy); ctx.lineTo(W - pad, fy); ctx.stroke(); ctx.restore();
  const note = clean(s.note);
  if (note) { let z = 2.9; while (z > 2.1 && mw(ctx, note, 500, z) > W - pad * 2) z -= 0.2; tx(ctx, note, W - pad, fy + 3.7, { size: z, w: 500, color: '#566660' }); }
  const by = H - 2.1;
  if (s.receipt) tx(ctx, 'توقيع الاستلام: ....................................', W - pad, by - 0.3, { size: 2.9, w: 500, color: '#566660' });
  if (url) { let z = 2.6; const room = s.receipt ? 40 : W - pad * 2; while (z > 1.9 && mw(ctx, url, 500, z, F_MONO) > room) z -= 0.1; tx(ctx, url.replace(/^https?:\/\//, ''), pad, by, { size: z, w: 500, fam: F_MONO, color: '#566660', align: 'left', dir: 'ltr' }); }
  // الحد
  if (s.border !== 'none') {
    ctx.save(); rr(ctx, 0.15, 0.15, W - 0.3, H - 0.3, 3);
    ctx.lineWidth = s.border === 'dashed' ? 0.3 : 0.35; ctx.strokeStyle = s.border === 'dashed' ? '#7d8782' : th.edge;
    if (s.border === 'dashed') ctx.setLineDash([1.8, 1.2]);
    ctx.stroke(); ctx.restore();
  }
}
function drawSheet(ctx, page, ppm, no, total) {
  const s = state.settings, L = LAYOUTS[s.layout] || LAYOUTS['2x4'];
  ctx.save();
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PAGE.w * ppm, PAGE.h * ppm);
  ctx.scale(ppm, ppm);
  const m = PAGE.margin, g = PAGE.gap;
  const cw = (PAGE.w - 2 * m - (L.cols - 1) * g) / L.cols, ch = (PAGE.h - 2 * m - (L.rows - 1) * g - (s.foot ? 3 : 0)) / L.rows;
  const k = Math.min(cw / 95, ch / 67), W = cw / k, H = ch / k;
  if (page) {
    page.idxs.forEach((ri, i) => {
      const col = i % L.cols, row = Math.floor(i / L.cols);
      const x = PAGE.w - m - (col + 1) * cw - col * g, y = m + row * (ch + g);
      ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
      drawCard(ctx, cardModel(state.data.rows[ri]), W, H);
      ctx.restore();
    });
    if (s.foot) {
      const label = [s.school, page.group, 'صفحة ' + no + ' من ' + total].filter(Boolean).join('  ·  ');
      tx(ctx, label, PAGE.w / 2, PAGE.h - 4.2, { size: 2.6, w: 500, color: '#7a8883', align: 'center' });
    }
  }
  ctx.restore();
}

/* ---------- المعاينة ---------- */
function schedule() { clearTimeout(drawTimer); drawTimer = setTimeout(drawPreview, 40); }
function drawPreview() {
  if (!state.data) return;
  const pages = makePages(), total = pages.length;
  if (state.page >= total) state.page = Math.max(0, total - 1);
  const cv = $('#sheet'), dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = Math.min(640, Math.max(260, cv.parentElement.clientWidth - 24));
  const ppm = (cssW * dpr) / PAGE.w;
  cv.width = Math.round(PAGE.w * ppm); cv.height = Math.round(PAGE.h * ppm);
  const ctx = cv.getContext('2d');
  drawSheet(ctx, pages[state.page], ppm, state.page + 1, total);
  if (!total) {
    ctx.save(); ctx.fillStyle = '#566660'; ctx.font = '600 ' + (4.4 * ppm) + 'px ' + F_UI; ctx.textAlign = 'center'; ctx.direction = 'rtl';
    ctx.fillText('لم تحدد أي طالب لإظهار بطاقته', cv.width / 2, cv.height / 2); ctx.restore();
  }
  $('#pgNo').textContent = total ? (state.page + 1) + ' / ' + total : '';
  $('#pgPrev').disabled = state.page <= 0; $('#pgNext').disabled = state.page >= total - 1;
  const L = LAYOUTS[state.settings.layout] || LAYOUTS['2x4'];
  $('#pvInfo').textContent = state.sel.size + ' بطاقة · ' + L.cols * L.rows + ' في الصفحة';
  $('#outInfo').textContent = total ? total + ' صفحة A4' : '—';
  $('#btnPdf').disabled = !total || exporting;
  const pg = pages[state.page];
  if (pg && pg.group) $('#pvInfo').textContent += ' · ' + pg.group;
}

/* ---------- ملف PDF ---------- */
let exporting = false;
async function deflate(u8) {
  const cs = new CompressionStream('deflate');
  const w = cs.writable.getWriter(); w.write(u8); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
function assemblePdf(imgs) {
  const enc = new TextEncoder(), chunks = [], off = [];
  let pos = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); pos += b.length; };
  push('%PDF-1.4\n'); push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
  const n = imgs.length, total = 2 + 3 * n;
  const obj = (id, body) => { off[id] = pos; push(id + ' 0 obj\n' + body + '\nendobj\n'); };
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  const kids = imgs.map((_, i) => (3 + 3 * i) + ' 0 R').join(' ');
  obj(2, '<< /Type /Pages /Kids [' + kids + '] /Count ' + n + ' >>');
  const PW = 595.276, PH = 841.89;
  imgs.forEach((im, i) => {
    const pid = 3 + 3 * i, cid = pid + 1, iid = pid + 2;
    obj(pid, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /XObject << /Im0 ' + iid + ' 0 R >> >> /Contents ' + cid + ' 0 R >>');
    const content = 'q ' + PW + ' 0 0 ' + PH + ' 0 0 cm /Im0 Do Q';
    obj(cid, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
    off[iid] = pos;
    push(iid + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h + ' /ColorSpace ' + (im.cs || '/DeviceRGB') + ' /BitsPerComponent 8 /Filter /' + im.filter + ' /Length ' + im.data.length + ' >>\nstream\n');
    push(im.data); push('\nendstream\nendobj\n');
  });
  const xref = pos;
  let x = 'xref\n0 ' + (total + 1) + '\n0000000000 65535 f \n';
  for (let i = 1; i <= total; i++) x += String(off[i]).padStart(10, '0') + ' 00000 n \n';
  push(x + 'trailer\n<< /Size ' + (total + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  return new Blob(chunks, { type: 'application/pdf' });
}
async function getDownloads() {
  try { return window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { return null; }
}
/* الحفظ: عبر claude.ai إن توفر، وإلا عبر تنزيل المتصفح العادي عند فتح الصفحة كملف مستقل */
const STANDALONE = !window.claude;
const NO_SAVE_MSG = 'هذا العرض لا يدعم حفظ الملفات. استخدم النسخة المستقلة من البرنامج (ملف HTML يُفتح من الجهاز)، أو اضغط «نسخ الجدول» والصقه في Excel.';
async function canSave() { return STANDALONE || !!(await getDownloads()); }
async function saveBlob(filename, blob) {
  const dl = await getDownloads();
  if (dl) return dl.save({ filename, data: blob });
  if (STANDALONE) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 120000);
    return { status: 'saved' };
  }
  const e = new Error('unavailable'); e.code = 'unavailable'; throw e;
}
async function fontsReady() {
  const sample = 'ابجد أحمد محمد 0123 abc';
  try {
    await Promise.all([
      document.fonts.load('400 16px "IBM Plex Sans Arabic"', sample), document.fonts.load('500 16px "IBM Plex Sans Arabic"', sample),
      document.fonts.load('600 16px "IBM Plex Sans Arabic"', sample), document.fonts.load('700 16px "IBM Plex Sans Arabic"', sample),
      document.fonts.load('500 16px "IBM Plex Mono"', 'abc 123'), document.fonts.load('600 16px "IBM Plex Mono"', 'abc 123'),
    ]);
  } catch (e) { /* الخطوط الاحتياطية تكفي */ }
}
/* لوحة ألوان من ٢٥٦ لونًا: البطاقة مصنوعة من ألوان قليلة، فيصغر الملف إلى الثلث تقريبًا دون فرق ظاهر */
function quantize(px) {
  const n = px.length >> 2, keys = new Uint16Array(n);
  const cnt = new Uint32Array(32768), sr = new Uint32Array(32768), sg = new Uint32Array(32768), sb = new Uint32Array(32768);
  for (let i = 0, a = 0; i < n; i++, a += 4) {
    const r = px[a], g = px[a + 1], b = px[a + 2], k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    keys[i] = k; cnt[k]++; sr[k] += r; sg[k] += g; sb[k] += b;
  }
  const used = [];
  for (let k = 0; k < 32768; k++) if (cnt[k]) used.push(k);
  const top = used.slice().sort((x, y) => cnt[y] - cnt[x]).slice(0, 256);
  const pal = top.map((k) => [sr[k] / cnt[k], sg[k] / cnt[k], sb[k] / cnt[k]]);
  const map = new Uint8Array(32768);
  used.forEach((k) => {
    const r = sr[k] / cnt[k], g = sg[k] / cnt[k], b = sb[k] / cnt[k];
    let best = 0, bd = Infinity;
    for (let j = 0; j < pal.length; j++) { const d = (pal[j][0] - r) ** 2 + (pal[j][1] - g) ** 2 + (pal[j][2] - b) ** 2; if (d < bd) { bd = d; best = j; } }
    map[k] = best;
  });
  const idx = new Uint8Array(n);
  for (let i = 0; i < n; i++) idx[i] = map[keys[i]];
  let hex = '';
  pal.forEach((c) => c.forEach((v) => { hex += Math.round(v).toString(16).padStart(2, '0'); }));
  return { idx, hex, size: pal.length };
}
async function exportPdf() {
  if (exporting) return;
  if (!(await canSave())) { notice('warn', NO_SAVE_MSG); return; }
  const pages = makePages();
  if (!pages.length) return;
  exporting = true; $('#btnPdf').disabled = true;
  const prog = $('#prog'), bar = prog.firstElementChild; prog.hidden = false; bar.style.width = '0';
  try {
    await fontsReady();
    const dpi = state.settings.dpi, ppm = dpi / 25.4;
    const W = Math.round(PAGE.w * ppm), H = Math.round(PAGE.h * ppm);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const imgs = [];
    const canDeflate = typeof CompressionStream !== 'undefined';
    for (let i = 0; i < pages.length; i++) {
      $('#outNote').textContent = 'جارٍ تجهيز الصفحة ' + (i + 1) + ' من ' + pages.length + '…';
      drawSheet(ctx, pages[i], ppm, i + 1, pages.length);
      if (canDeflate) {
        const q = quantize(ctx.getImageData(0, 0, W, H).data);
        imgs.push({ w: W, h: H, filter: 'FlateDecode', cs: '[/Indexed /DeviceRGB ' + (q.size - 1) + ' <' + q.hex + '>]', data: await deflate(q.idx) });
      } else {
        const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.92));
        imgs.push({ w: W, h: H, filter: 'DCTDecode', data: new Uint8Array(await blob.arrayBuffer()) });
      }
      bar.style.width = Math.round(((i + 1) / pages.length) * 100) + '%';
      await new Promise((r) => setTimeout(r, 0));
    }
    const blob = assemblePdf(imgs);
    $('#outNote').textContent = 'تم تجهيز الملف (' + (blob.size / 1048576).toFixed(1) + ' ميجابايت).';
    await saveBlob('بطاقات-الطلاب.pdf', blob);
    $('#outNote').textContent = 'تم حفظ الملف. افتحه واطبعه بمقياس 100% على ورق A4.';
  } catch (e) {
    if (e && e.code === 'declined') $('#outNote').textContent = 'تم إلغاء الحفظ. الملف جاهز متى أردت.';
    else if (e && e.code === 'unavailable') notice('warn', NO_SAVE_MSG);
    else notice('error', 'تعذّر تجهيز الملف: ' + ((e && e.message) || e));
  } finally {
    exporting = false; prog.hidden = true; $('#btnPdf').disabled = !pages.length;
  }
}
async function copyTable() {
  const d = state.data;
  const esc = (v) => String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ');
  const text = [d.columns.map(esc).join('\t')].concat(d.rows.map((r) => d.columns.map((c) => esc(r[c])).join('\t'))).join('\n');
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0';
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
  }
  if (ok) notice('ok', 'تم نسخ ' + d.rows.length + ' صفًا. افتح Excel والصق بالضغط على Ctrl+V في الخلية A1.');
  else notice('error', 'تعذّر النسخ تلقائيًا. انسخ الجدول يدويًا من جدول الطلاب في الأسفل.');
}
async function exportXlsx() {
  if (!(await canSave())) { notice('warn', NO_SAVE_MSG); return; }
  try {
    await ensureXlsx();
    const d = state.data;
    const aoa = [d.columns].concat(d.rows.map((r) => d.columns.map((c) => r[c] == null ? '' : r[c])));
    const wb = window.XLSX.utils.book_new(), ws = window.XLSX.utils.aoa_to_sheet(aoa);
    window.XLSX.utils.book_append_sheet(wb, ws, 'الكشف');
    wb.Workbook = { Views: [{ RTL: true }] };
    const out = window.XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    await saveBlob('كشف-الطلاب.xlsx', new Blob([out]));
  } catch (e) { if (e && e.code === 'unavailable') notice('warn', NO_SAVE_MSG); else if (!(e && e.code === 'declined')) notice('error', 'تعذّر تجهيز ملف Excel: ' + ((e && e.message) || e)); }
}

/* ---------- بيانات نموذجية ---------- */
function sampleData() {
  const names = ['محمد أحمد علي حسن', 'فاطمة محمود إبراهيم السيد', 'يوسف خالد عبد الرحمن محمد', 'مريم سامي فتحي عبد الله',
    'عمر حسام الدين مصطفى عيسى', 'سلمى طارق أحمد شعبان', 'آدم كريم صابر عبد الفتاح', 'نور محمد عبد العظيم حسانين'];
  const pw = ['Xk7!pQ2m', 'b9?TrL_4', 'Wd3_vN8z', 'hG5!yE6c', 'Q2?mKs9R', 'tP8_xU4j', 'Zc6!aF3w', 'nV4?Hd7B'];
  const rows = names.map((n, i) => ({
    'م': String(i + 1), 'اسم الطالب': n, 'كود الطالب': String(400000101 + i * 7), 'المستخدم': String(400000101 + i * 7),
    'كلمة المرور': pw[i], 'الصف': i < 5 ? 'الصف الاول' : 'الصف الثاني', 'المدرسة': SAMPLE_SCHOOL,
  }));
  return { columns: ['م', 'اسم الطالب', 'كود الطالب', 'المستخدم', 'كلمة المرور', 'الصف', 'المدرسة'], rows, meta: { url: SAMPLE_URL } };
}

/* ---------- الأحداث ---------- */
function bind() {
  const drop = $('#drop'), file = $('#file');
  drop.addEventListener('click', () => file.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
  file.addEventListener('change', (e) => { ingestFile(e.target.files[0]); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => ingestFile(e.dataTransfer.files[0]));
  $('#btnPaste').addEventListener('click', () => { $('#pasteBox').hidden = !$('#pasteBox').hidden; if (!$('#pasteBox').hidden) $('#pasteText').focus(); });
  $('#btnPasteGo').addEventListener('click', () => {
    const t = CardsCore.tableFromMatrix(CardsCore.parseDelimited($('#pasteText').value));
    if (!t.rows.length) { notice('error', 'لم أجد صفوفًا في النص الملصوق. تأكد من وجود صف عناوين وصفوف طلاب.'); return; }
    applyData(t, 'جدول ملصوق', false); $('#pasteBox').hidden = true;
  });
  $('#selName').addEventListener('change', (e) => { state.roles.name = e.target.value; initFieldsKeep(); renderFields(); renderTable(); schedule(); });
  $('#selGrade').addEventListener('change', (e) => { state.roles.grade = e.target.value || undefined; state.page = 0; renderGradeFilter(); renderTable(); schedule(); });
  $('#btnXlsx').addEventListener('click', exportXlsx);
  $('#btnCopy').addEventListener('click', copyTable);
  $('#btnPdf').addEventListener('click', exportPdf);
  $('#pgPrev').addEventListener('click', () => { state.page = Math.max(0, state.page - 1); schedule(); });
  $('#pgNext').addEventListener('click', () => { state.page += 1; schedule(); });
  $('#q').addEventListener('input', renderTable);
  $('#gradeFilter').addEventListener('change', renderTable);
  $('#btnAll').addEventListener('click', () => { visibleIdx().forEach((i) => state.sel.add(i)); renderTable(); state.page = 0; schedule(); });
  $('#btnNone').addEventListener('click', () => { visibleIdx().forEach((i) => state.sel.delete(i)); renderTable(); state.page = 0; schedule(); });
  window.addEventListener('resize', schedule);
  document.addEventListener('paste', (e) => {
    const tgt = e.target;
    if (tgt && (tgt.closest('input, textarea, [contenteditable]'))) return;
    const f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0];
    if (f) { ingestFile(f); return; }
    const t = e.clipboardData && e.clipboardData.getData('text');
    if (t && t.includes('\t')) { const tb = CardsCore.tableFromMatrix(CardsCore.parseDelimited(t)); if (tb.rows.length) applyData(tb, 'جدول ملصوق', false); }
  });
}
function initFieldsKeep() {
  // عند تغيير عمود الاسم: أعد حساب القائمة مع الحفاظ على ما عدّله المستخدم
  const old = new Map(state.fields.map((f) => [f.col, f]));
  initFields();
  state.fields.forEach((f) => { const o = old.get(f.col); if (o) { f.on = o.on; f.label = o.label; } });
}

/* ---------- البدء ---------- */
load();
bindSettings();
bind();
applyData(sampleData(), 'نموذج', true);
state.settings.theme = state.settings.theme in THEMES ? state.settings.theme : 'teal';
syncSettingsUi();
drawPreview();
(async () => { await fontsReady(); drawPreview(); })();
window.__cards = { state, makePages, drawSheet, exportPdf, ingestFile, applyData };

/* ---------- دمج بيانات نبراس برو ---------- */
async function loadFromNebras() {
  try {
    // 0. فحص وجود ملف PDF لكشف بيانات الدخول لمنصة التدريب تم سحبه تلقائياً من لوحة الوزارة (/dashboard)
    let trainingPdfB64 = null;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        const stPdf = await chrome.storage.local.get(['neprasTrainingCardsPdf']);
        if (stPdf?.neprasTrainingCardsPdf?.base64) {
          trainingPdfB64 = stPdf.neprasTrainingCardsPdf.base64;
        }
      } catch (_) {}
    }
    if (!trainingPdfB64) {
      try {
        const rawPdf = localStorage.getItem('neprasTrainingCardsPdf');
        if (rawPdf) {
          const parsedPdf = JSON.parse(rawPdf);
          if (parsedPdf?.base64) trainingPdfB64 = parsedPdf.base64;
        }
      } catch (_) {}
    }

    if (trainingPdfB64 && typeof window.pdfjsLib !== 'undefined' && typeof CardsCore !== 'undefined' && CardsCore.parsePdf) {
      try {
        await ensurePdfLib();
        notice('', 'جارٍ قراءة وتحليل كشف بيانات الدخول لمنصة التدريب (PDF)…');
        const binStr = atob(trainingPdfB64);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i) & 0xff;
        const parsedTable = await CardsCore.parsePdf(window.pdfjsLib, bytes, (p, n) => notice('', 'جارٍ قراءة الصفحة ' + p + ' من ' + n + '…'));
        if (parsedTable && Array.isArray(parsedTable.rows) && parsedTable.rows.length > 0) {
          applyData(parsedTable, 'كشف بيانات الدخول لمنصة التدريب (' + parsedTable.rows.length + ' طالب) — الوزارة', false);
          syncSettingsUi();
          schedule();
          notice('ok', 'تم استيراد وتحليل كشف بيانات الدخول لمنصة التدريب (' + parsedTable.rows.length + ' طالب) بنجاح! البطاقات جاهزة بالباركود واسم المستخدم وكلمة المرور.');
          return true;
        }
      } catch (pdfErr) {
        console.warn('Error parsing neprasTrainingCardsPdf:', pdfErr);
      }
    }

    let neprasData = null;
    let schoolInfo = null;

    // 1. فحص chrome.storage.local
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        const stored = await chrome.storage.local.get([
          'neprasStudentCardsPayload',
          'neprasSchoolStatsV1',
          'neprasCachedStudentsList',
          'nepras_active_school_code',
          'neprasCurrentSchoolName'
        ]);
        if (stored?.neprasStudentCardsPayload) {
          neprasData = stored.neprasStudentCardsPayload.students || stored.neprasStudentCardsPayload;
          schoolInfo = stored.neprasStudentCardsPayload.schoolInfo || null;
        } else if (Array.isArray(stored?.neprasCachedStudentsList) && stored.neprasCachedStudentsList.length) {
          neprasData = stored.neprasCachedStudentsList;
          schoolInfo = { schoolName: stored.neprasCurrentSchoolName || '' };
        } else if (stored?.neprasSchoolStatsV1?.detailRows?.length) {
          neprasData = stored.neprasSchoolStatsV1.detailRows;
          schoolInfo = stored.neprasSchoolStatsV1.meta || null;
        }
        if ((!Array.isArray(neprasData) || !neprasData.length) && stored?.nepras_active_school_code) {
          const schoolKey = 'nepras_school_data_' + stored.nepras_active_school_code;
          const schoolStored = await chrome.storage.local.get([schoolKey]);
          const schoolBucket = schoolStored?.[schoolKey];
          if (Array.isArray(schoolBucket?.neprasCachedStudentsList) && schoolBucket.neprasCachedStudentsList.length) {
            neprasData = schoolBucket.neprasCachedStudentsList;
            schoolInfo = { schoolName: schoolBucket.schoolName || stored.neprasCurrentSchoolName || '' };
          } else if (schoolBucket?.neprasSchoolStatsV1?.detailRows?.length) {
            neprasData = schoolBucket.neprasSchoolStatsV1.detailRows;
            schoolInfo = schoolBucket.neprasSchoolStatsV1.meta || { schoolName: schoolBucket.schoolName || '' };
          }
        }
      } catch (err) {
        console.warn('chrome.storage error:', err);
      }
    }

    // 2. فحص localStorage كبديل
    if (!neprasData) {
      try {
        const raw = localStorage.getItem('neprasStudentCardsPayload');
        if (raw) {
          const parsed = JSON.parse(raw);
          neprasData = parsed.students || parsed;
          schoolInfo = parsed.schoolInfo || null;
        }
      } catch (_) {}
    }

    if (!neprasData) {
      try {
        const rawStats = localStorage.getItem('neprasSchoolStatsV1');
        if (rawStats) {
          const parsedStats = JSON.parse(rawStats);
          if (parsedStats?.detailRows?.length) {
            neprasData = parsedStats.detailRows;
            schoolInfo = parsedStats.meta || null;
          }
        }
      } catch (_) {}
    }

    if (Array.isArray(neprasData) && neprasData.length > 0) {
      const columns = ['اسم الطالب', 'كود الطالب', 'المستخدم', 'كلمة المرور', 'الصف', 'الفصل', 'الرقم القومي'];
      const rows = neprasData.map(s => {
        const code = String(s.code || s.studentCode || s['كود الطالب'] || s['كود التلميذ'] || '').trim();
        const name = String(s.name || s.fullName || s.studentName || s['اسم الطالب'] || s['اسم التلميذ'] || '').trim();
        return {
          'اسم الطالب': name,
          'كود الطالب': code,
          'المستخدم': String(s.username || s.user || s['المستخدم'] || s['اسم المستخدم'] || code).trim(),
          'كلمة المرور': String(s.password || s.pass || s['كلمة المرور'] || '').trim(),
          'الصف': String(s.grade || s.gradeName || s['الصف'] || '').trim(),
          'الفصل': String(s.className || s.classRoom || s.class || s['الفصل'] || '').trim(),
          'الرقم القومي': String(s.nationalId || s.nid || s['الرقم القومي'] || '').trim()
        };
      }).filter(r => r['اسم الطالب'] || r['كود الطالب']);

      const schoolName = schoolInfo?.schoolName || schoolInfo?.school || 'المدرسة';
      applyData({
        columns,
        rows,
        meta: {
          title: 'بطاقات طلاب ' + schoolName,
          school: schoolName
        }
      }, 'كشف طلاب ' + schoolName + ' (' + rows.length + ' طالب) — نبراس برو', false);

      if (schoolInfo?.schoolName || schoolInfo?.school) {
        state.settings.school = schoolInfo.schoolName || schoolInfo.school;
        state.touched.school = true;
      }
      if (schoolInfo?.logo && !state.settings.logo) {
        state.settings.logo = schoolInfo.logo;
        setLogo();
      }
      syncSettingsUi();
      schedule();
      notice('ok', 'تم استيراد كشف طلاب ' + schoolName + ' (' + rows.length + ' طالب) بنجاح من نبراس برو.');
      return true;
    } else {
      notice('warn', 'يمكنك سحب ورفع ملف PDF «كشف بيانات الدخول لطلاب لمنصة التدريب» المحمّل من لوحة الوزارة أعلاه، أو الضغط على استيراد من نبراس.');
      return false;
    }
  } catch (err) {
    console.error('Error in loadFromNebras:', err);
    notice('error', 'حدث خطأ أثناء استيراد البيانات من نبراس: ' + err.message);
    return false;
  }
}

document.getElementById('btnTopNebrasImport')?.addEventListener('click', loadFromNebras);
document.getElementById('btnPanelNebrasImport')?.addEventListener('click', loadFromNebras);

// الاستيراد التلقائي عند بدء التشغيل إذا توفرت بيانات
setTimeout(() => {
  loadFromNebras();
}, 200);

})();
