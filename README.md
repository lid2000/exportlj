# exportlj
Exports a LiveJournal to a SQLite database using Node.js

A long long time ago, I wrote a LiveJournal client called Deepest Sender. It was done in XUL for Mozilla/Netscape 6 and later
Phoenix/Firebird/Firefox and it ended up being pretty popular. One of the last things I worked on before it was abandoned
(around the same time everyone abandoned LiveJournal) was LJ Sync, a feature which downloaded your entire LiveJournal to a
local SQLite database, so that you could have an offline backup of it, and actually do full-text search.

Fast forward 10 years and I find myself wanting to do a full-text search on my long-abandoned LiveJournal. I dig up my password,
log in, and it turns out that you STILL can't do it on the site without switching your journal to public and relying on
Google or whatever garbage they've integrated with, which is insane. LiveJournal could have been one of the major
social networks if they'd spent the past 10 years innovating instead of doing... whatever they've been doing. Instead I now
have to rely on Tumblr and all the features it doesn't have if I get the urge to be an emo teenager.

Anyway, given that Mozilla have abandoned XUL (and Deepest Sender stopped working properly ages ago) and I'm trying to rekindle
my love of coding, I started working on this - a Node.js app that'll let you download your LiveJournal and save it to a SQLite
database. It's up to you what you do with it from there, but there's heaps of utilities that can read SQLite files, such as
[DB Browser for SQLite](http://sqlitebrowser.org/). Hopefully one day someone who isn't me will come up with a cool LJ-specific
interface for reading it.

At the moment all exportlj does is export entries - I'm still working on getting comments and shared journals working.

## Installation
Make sure you've got a recent version of Node installed. I'm using 8.7.0 at the time of writing. Then check out this repository,
and run
```
npm install
```
You're all set up.

## Usage
First up, you need to set up a `config.json` file. This is pretty basic for now. You can see `config.sample.json` for an example
of how it should look, or you can look at this:
```
{
  "username": "yourusername",
  "password": "yourpassword",
  "url": "yourljserver"
}
```
If you're using LiveJournal, the `url` parameter is always going to be `https://www.livejournal.com`. If you're using Dreamwidth
or DeadJournal (or whatever else) change it to the appropriate address.

So your config file is set up? All that's left to do now is go to the directory and run

```
node exportlj.js
```
...and cross your fingers.

What *should* happen next is exportlj will create a file called `<username>.sqlite3` and start downloading the contents of your
LiveJournal to it. For me it takes between 5 to 10 minutes to run and I'm left with a record of my early 20s to get nostalgic
over, cringe and wonder how I managed to have so much unfounded arrogance.

Every subsequent execution will sync items that have changed since you last did it, so if you're still one of the three (if that)
people using LiveJournal, you can keep your journal up to date without having to wait for the entire thing to download each time.

## To do
* Save entry props
* Document database schema
* Get comment exports working
* Get shared journals working (although I suspect you can only download your own posts from them)

## Thanks
A big thanks to Robert Strong and Jed Brown for their help on Deepest Sender all those years ago, as well as whoever wrote
[ljArchive](http://ljarchive.sourceforge.net/), because the source code to that was immensely helpful when I was trying to
figure out where I was going wrong with syncing 10 years ago. And thanks to all the Deepest Sender users, my LJ friends and
everyone that made LiveJournal so awesome back in the early 2000s.
