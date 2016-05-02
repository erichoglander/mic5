/**
 * Contains mic5 class
 * @author Eric Höglander
 */
/**
 * mic5 class
 * Records from user microphone with WebAPI
 * No external plug-ins required.
 * @example example.html A simple recording example
 */
function mic5(callback) {

  /**
   * Audio context
   * @link https://developer.mozilla.org/en-US/docs/Web/API/AudioContext
   * @var AudioContext
   */
  this.ctx = null;

  /**
   * Audio stream
   * @link https://developer.mozilla.org/en-US/docs/Web/API/LocalMediaStream
   * @var LocalMediaStream
   */
  this.stream = null;


  /**
   * Checks for compatibility and ask for recording permissions
   * Since we have to wait for permission to record we need a callback
   * @param callback
   */
  this.init = function(callback) {
    if (!this.isCompatible())
      callback(false);
    var self  = this;
    var success = function(e) {
      self.stream = e;
      callback(true);
    };
    var error = function(e) {
      callback(false);
    };
    navigator.getUserMedia({audio: true}, success, error);
  }

  /**
   * Checks if the browser is compatible with the technology we want to use
   * @return bool
   */
  this.isCompatible = function() {
    // Check for different getUserMedia implementations
    if (!navigator.getUserMedia) {
      navigator.getUserMedia = 
        navigator.getUserMedia || 
        navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia || 
        navigator.msGetUserMedia;
      if (!navigator.getUserMedia)
        return false;
    }
    // Check for different AudioConect implementations
    if (!window.AudioContext) {
      window.AudioContext = window.webkitAudioContext;
      if (!window.AudioContext)
        return false;
    }
    return true;
  }
  
  /**
   * Start recording
   * @return bool
   */
  this.record = function() {
    if (!this.stream)
      return false;
    var buffer_size = 2048;
    var self = this;
    this.data = {
      length: 0,
      channels: [[],[]],
    };
    this.ctx = new AudioContext();
    var gain = this.ctx.createGain();
    var input = this.ctx.createMediaStreamSource(this.stream);
    input.connect(gain);
    var recorder = this.ctx.createScriptProcessor(buffer_size, 2, 2);
    recorder.onaudioprocess = function(e) {
      self.data.channels[0].push(new Float32Array(e.inputBuffer.getChannelData(0)));
      self.data.channels[1].push(new Float32Array(e.inputBuffer.getChannelData(1)));
      self.data.length+= buffer_size;
    };
    gain.connect(recorder);
    recorder.connect(this.ctx.destination);
    return true;
  }

  /**
   * Close recording
   * This will not give up recording permissions
   */
  this.close = function() {
    this.ctx.close();
  }

  /**
   * Pause recording
   */
  this.pause = function() {
    this.ctx.pause();
  }

  /**
   * Resume recording
   */
  this.resume = function() {
    this.ctx.resume();
  }

  /**
   * Stop recording
   * This will give up recording permissions
   */
  this.stop = function() {
    var tracks = this.stream.getAudioTracks();
    for (var i=0; i<tracks.length; i++)
      tracks[i].stop();
  }

  /**
   * Write recorded data into a blob
   * @link https://developer.mozilla.org/en-US/docs/Web/API/Blob
   * @return Blob
   */
  this.getBlob = function() {
    var interleaved = this.interleave(
      this.mergeBuffer(this.data.channels[0], this.data.length),
      this.mergeBuffer(this.data.channels[1], this.data.length)
    );
    var buffer = new ArrayBuffer(44+interleaved.length*2);
    var view = new DataView(buffer);

    // Write WAV headers
    // https://ccrma.stanford.edu/courses/422/projects/WaveFormat/
    this.writeUTFBytes(view, 0, "RIFF");
    view.setUint32(4, 44+interleaved.length*2);
    this.writeUTFBytes(view, 8, "WAVE");
    // FMT
    this.writeUTFBytes(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    // Stereo
    view.setUint16(22, 2, true);
    view.setUint32(24, this.ctx.sampleRate, true);
    view.setUint32(28, this.ctx.sampleRate*4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    // Data sub-chunk
    this.writeUTFBytes(view, 36, "data");
    view.setUint32(40, interleaved.length*2, true);

    // Write PCM samples
    for (var i=0, index=44; i<interleaved.length; i++, index+= 2) 
      view.setInt16(index, interleaved[i] * 0x7FFF, true);

    return new Blob([view], {type: "audio/wav"});
  }

  /**
   * Get the base64-encoded WAV-data
   * @param function Function to be called with base64-string as argument
   */
  this.getBase64 = function(callback) {
    this.blobToBase64(this.getBlob(), callback);
  }

  /**
   * Download WAV file directly
   */
  this.download = function() {
    this.getBase64(function(str) {
      var a = document.createElement("a");
      a.setAttribute("download", "record.wav");
      a.href = str;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  }


  /**
   * Convert a blob to a base64-encoded string
   * @param Blob
   * @param function Function to be called with base64-string as argument
   */
  this.blobToBase64 = function(blob, callback) {
    var reader = new FileReader();
    reader.addEventListener("loadend", function() {
      callback(reader.result);
    }, false);
    reader.readAsDataURL(blob);
  }

  /**
   * Encode a string as a uint8 into a DataView
   * @param DataView
   * @param int
   * @param string
   * @link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView
   */
  this.writeUTFBytes = function(view, offset, str) {
    for (var i=0; i<str.length; i++)
      view.setUint8(offset+i, str.charCodeAt(i));
  }

  /**
   * Interleave two channels
   * @param  Float32Array
   * @param  Float32Array
   * @return Float32Array
   */
  this.interleave = function(left, right) {
    var length = left.length + right.length;
    var result = new Float32Array(length);
    for (var i=0, index = 0; i<length; index++) {
      result[i++] = left[index];
      result[i++] = right[index];
    }
    return result;
  }

  /**
   * Merge buffer into a Float32Array
   * @param array
   * @param int
   * @return Float32Array
   */
  this.mergeBuffer = function(buffer, length) {
    var result = new Float32Array(length);
    var offset = 0;
    for (var i=0; i<buffer.length; i++) {
      var bfr = buffer[i];
      result.set(bfr, offset);
      offset+= bfr.length;
    }
    return result;
  }

}