// angular, pouchdb loaded at this point
angular
.module('zine', ['ngRoute'])
.constant('marked', marked)
.constant('db', new PouchDB('zine'))
.constant('ddoc', {
  _id: '_design/index',
  views: {
    all: {
      map: function (doc) {
        if (doc.path && doc.datetime) {
          emit(doc.datetime)
        }
      }.toString()
    },
    tag: {
      map: function (doc) {
        if (doc.tags && doc.tags.length) {
          doc.tags
          .forEach(function (tag) {
            emit(tag)
          })
        }
      }.toString()
    },
    date: {
      map: function (doc) {
        if (doc.datetime) {
          var parts = doc.datetime.split('T')[0].split('-')
          emit([parts[0], parts[1], parts[2]])
        }
      }.toString(),
      reduce: '_count'
    },
    text: {
      map: function (doc) {
        if (doc.text) {
          doc.text
          .match(/[\d\w-_]+/g)
          .forEach(function (match) {
            emit(match)
          })
        }
      }.toString()
    },
    person: {
      map: function (doc) {
        if (doc.people && doc.people.length) {
          doc.people
          .forEach(function (person) {
            emit(person)
          })
        }
      }.toString()
    }
  }
})
.config(function ($routeProvider) {
  $routeProvider
  .when('/', {
    templateUrl: '/templates/list.html',
    controller: 'SearchController'
  })
  .when('/archive', {
    templateUrl: '/templates/archive.html',
    controller: 'ArchiveController'
  })
  .when('/about', {
    templateUrl: '/templates/list.html',
    controller: 'AboutController'
  })
  .otherwise({
    redirectTo: '/'
  })
})
.controller('SetupController', function ($scope, db, ddoc, $http, $q) {
  // check pouchdb to see if zine has already been installed
  $q.when(db.info())
  .then(function (info) {
    if (info && info.doc_count !== 0) {
      // throws an error to skip .then clauses
      throw new Error("Already installed. Skipping setup...")
    }
  })
  // list contents of text folder
  .then(function () {
    return $http.get('/txt/').then(function (response) {
      var matches = response.data.match(/<a href="\/txt\/([\w\d_]+).md/g)
      return matches.map(function (match) {
        var path = match.split('href="')[1]
        var id = path.split('/txt/')[1].slice(0, -3)
        return {
          path: path,
          _id: id
        }
      })
    })
  })
  // download each file in the folder
  // and save each to pouchdb
  .then(function (posts) {
    var promises = posts.map(function (post) {
      return $http.get(post.path)
      .then(function (response) {
        var split_index = response.data.indexOf('\n\n')
        var text = response.data.slice(split_index + 2)
        post.text = text
        // process like datetime, people, and tags
        response.data.slice(0, split_index).split('\n').map(function (line) {
          var parts = line.split(': ')
          if (parts.length !== 2) {
            // exit early if there aren't enough parts
            return null
          }
          if (['tags', 'people'].indexOf(parts[0]) > -1) {
            post[parts[0]] = parts[1].split(',')
          } else {
            post[parts[0]] = parts[1]
          }
        })
        return post
      })
    })

    return $q.all(promises)
    .then(function (posts) {
      return db.bulkDocs(posts)
    })
  })
  // initialize indexes on contents
  .then(function () {
    return db.put(ddoc).then(function () {
      // build each index with {stale:'update_after'}
      // so they begin building immediately
      var promises = ['all', 'tag', 'date', 'person', 'text'].map(function (index) {
        return db.query('index/' + index, {stale: 'update_after'})
      })
      return $q.all(promises)
    })
  })
  // once finished, update DOM
  .then(function () {
    $scope.loaded = true
  })
  // if already installed, update DOM
  .catch(function () {
    $scope.loaded = true
  })
})
.controller('SearchController', function ($scope, db, $location) {
  function get_posts (index, keys) {
    var promise
    if (index && keys) {
      promise = db.query('index/' + index, {
        keys: keys.split(','),
        include_docs: true,
        reduce: false
      })
    } else {
      promise = db.query('index/all', {
        include_docs: true
      })
    }
    promise
    .then(function (response) {
      $scope.$apply(function () {
        $scope.posts = response.rows.map(function (row) {
          return row.doc
        })
      })
    })
    .catch(function (err) {
      if (err.message === 'missing') {
        // try again like fucking sisyphus
        get_posts(index, keys)
      } else {
        console.trace(err)
      }
    })
  }
  // #/?{tag,date,text,person}
  var search = $location.search()
  if (search.tag)
    get_posts('tag', search.tag)
  else if (search.date)
    get_posts('date', search.date)
  else if (search.text)
    get_posts('text', search.text)
  else if (search.person)
    get_posts('person', search.person)
  // #/
  else
    get_posts()
})
.controller('NavController', function ($scope, $location) {
  // TODO search buttons
})
.controller('ArchiveController', function ($scope, db) {
  function get_archive () {
    db.query('index/date', {group:true})
    .then(function (response) {
      $scope.$apply(function () {
        $scope.dates = response.rows.map(function (row) {
          return {
            value: [row.key[0], row.key[1] - 1, row.key[2]].join('-')
            count: row.value
          }
        })
      })
    })
    .catch(function (err) {
      if (err.message === 'missing') {
        // AND ANOTHER ONE
        get_archive()
      } else {
        console.log(arguments)
      }
    })
  }

  get_archive()
})
.controller('AboutController', function ($scope, db) {
  function get_about () {
    db.get('about')
    .then(function (post) {
      $scope.$apply(function () {
        $scope.posts = [post]
      })
    })
    .catch(function (err) {
      if (err.message === 'missing') {
        // AND ANOTHER ONE
        get_about()
      } else {
        console.log(arguments)
      }
    })
  }

  get_about()
})
.filter('markdown', function (marked, $sce) {
  return function (input) {
    if (!input) return

    var html = marked(input)
    var safe_html = $sce.trustAsHtml(html)
    return safe_html
  }
})