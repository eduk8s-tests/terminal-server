Terminal Server
===============

This is a POC for an implementation of a terminal server for use with the
eduk8s workshop dashboard.

To test, first install the required dependencies by running:

```
npm install
```

Next build the application:

```
npm run compile
```

You can then start the test application by running:

```
npm start
```

A terminal will be accessible at:

* http://localhost:8080

This should redirect to:

* http://localhost:8080/terminal/session/1

You can create additional terminal sessions by changing the session name
in the URL. For example:

* http://localhost:8080/terminal/session/2

Although multiple terminal sessions could be included in a single web page
using an iframe, when integrated within the eduk8s workshop dashboard they
will be able to be embedded direct in the page. To test this use case use:

* http://localhost:8080/terminal/testing/

This will create two terminal sessions equating to session "1" and "2", the
same as above.

Note that you should avoid creating multiple browser pages on the same
session as the different terminal sizes of each can cause redraw issues.
