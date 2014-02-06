module.exports = function(grunt) {

  grunt.loadNpmTasks('grunt-mocha-test');
  grunt.loadNpmTasks('grunt-jsdoc');

  grunt.initConfig({
    mochaTest: {
      test: {
        src: ['test/*.js']
      }
    },
    jsdoc : {
        dist : {
            src: ['lib/task.js'], 
            options: {
                destination: 'doc'
            }
        }
    }
  });

  grunt.registerTask('default', ['mochaTest']);

};