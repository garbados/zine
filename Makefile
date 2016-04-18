default:
	rm static/list.txt
	ls static/txt > static/list.txt
	git add . && git commit -m "fuck" && git push origin master
	cd static
	git add . && git commit -m "regular update" && git push origin gh-pages
