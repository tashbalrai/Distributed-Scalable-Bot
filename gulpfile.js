var
  gulp = require('gulp'),
  babel = require('gulp-babel'),
  watch = require('gulp-watch');

gulp.task('babel', function () {
  return gulp.src('./es6/**/*.js')
    .pipe(babel())
    .pipe(gulp.dest('./lib/'));
});

var watcher1 = gulp.watch('./es6/**/*.js', ['babel']);
watcher1.on('change', ev => {
  console.log('File', ev.path, 'has', ev.type);
});