var mic;

function start() {
  // Since we have to ask for permission
  var callback = function(success) {
    if (success)
      mic.record();
  };
  mic = new mic5();
  mic.init(callback);
}