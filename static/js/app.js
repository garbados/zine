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
          var date = doc.datetime.split('T')[0]
          emit(date)
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
    templateUrl: 'templates/list.html',
    controller: 'SearchController'
  })
  .when('/archive', {
    templateUrl: 'templates/archive.html',
    controller: 'ArchiveController'
  })
  .when('/about', {
    templateUrl: 'templates/list.html',
    controller: 'AboutController'
  })
  .otherwise({
    redirectTo: '/'
  })
})
.controller('SetupController', function ($scope, db, ddoc, $http, $q, $location) {
  $q.when(db.info())
  // list contents of text folder
  .then(function (info) {
    return $http.get('list.txt').then(function (response) {
      var lines = response.data.split('\n')
      return lines.map(function (line) {
        var path = ['txt', line].join('/')
        var id = line.slice(0, -3) // chops off .md
        return {
          path: path,
          _id: id
        }
      })
    }).then(function (posts) {
      // compare db info with txt folder contents to see if zine is up-to-date
      if (info.doc_count - posts.length !== 1) {
        return posts
      } else {
        throw new Error("Already installed. Skipping setup...")
      }
    })
  })
  // download each file in the folder
  // and save each to pouchdb
  .then(function (posts) {
    console.log(posts)
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
  // once finished, update DOM, redirect to about
  .then(function () {
    $scope.loaded = true
    $location.url('/about')
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
  // search buttons
  var search = {
    tags: function () {
      $location.url('/?tag=' + $scope.query)
    },
    dates: function () {
      $location.url('/?date=' + $scope.query)
    },
    people: function () {
      $location.url('/?person=' + $scope.query)
    },
    text: function () {
      $location.url('/?text=' + $scope.query)
    }
  }
  $scope.search = search
})
.controller('ArchiveController', function ($scope, db) {
  function get_archive () {
    db.query('index/date', {group:true})
    .then(function (response) {
      $scope.$apply(function () {
        $scope.dates = response.rows.map(function (row) {
          return {
            value: row.key,
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