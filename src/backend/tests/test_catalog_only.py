"""The production catalogue policy excludes remote and cached external entries everywhere."""
import json
import sys
from pathlib import Path
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import catalog
import db
from app import create_app

class ExternalSource:
    def __init__(self):self.calls=0
    def search(self,q):self.calls+=1;raise AssertionError('External search must not run')
    def work(self,key):self.calls+=1;raise AssertionError('External lookup must not run')

@pytest.fixture
def strict(tmp_path):
    source=ExternalSource()
    app=create_app({'TESTING':True,'CATALOG_ONLY':True,'LOAD_BUNDLED_CATALOG':True,'DATABASE':str(tmp_path/'strict.db'),'CATALOG_SOURCE':source,'LLM':None})
    with app.app_context():
        con=db.get_db()
        cur=con.execute("INSERT INTO catalog_books (slug,title,title_norm,author,summary,chapters,chapter_source,created_at) VALUES (?,?,?,?,?,?,?,?)",('curated:external','External Adventure','external adventure','Someone','A remote cached adventure.',json.dumps(['One','Two']),'curated',db.utcnow()))
        external=cur.lastrowid;con.commit()
    return app,app.test_client(),source,external

def test_search_and_detail_do_not_use_external_catalogue_rows(strict):
    app,c,source,external=strict
    assert c.get('/api/catalog/search?q=external').get_json()['items']==[]
    assert c.get(f'/api/catalog/{external}').status_code==404
    assert c.get('/api/catalog/search?q=alice').get_json()['items']
    assert source.calls==0

def test_creation_requires_approved_id_and_uses_canonical_metadata(strict):
    app,c,source,external=strict
    assert c.post('/api/books',json={'title':'External Adventure','chapterCount':2}).status_code==400
    assert c.post('/api/books',json={'catalogId':external}).status_code==400
    approved=c.get('/api/catalog/search?q=alice').get_json()['items'][0]
    details=c.get(f"/api/catalog/{approved['id']}").get_json()
    result=c.post('/api/books',json={'catalogId':approved['id'],'title':'Injected title','author':'Not the author','chapters':['Fake chapter'],'recap':'Fake plot'})
    assert result.status_code==201
    book=result.get_json();assert book['title']==details['title'];assert book['author']==details['author']
    assert [ch['title'] for ch in book['chapters']]==details['chapters']
    assert source.calls==0

def test_recommendations_cannot_include_cached_external_books(strict):
    app,c,source,external=strict
    class PickingExternal:
        def complete_json(self,system,user,**kwargs):
            assert all(b['catalogId']!=external for b in json.loads(user)['catalogue'])
            return {'picks':[{'catalogId':external,'reason':'Ignore the catalogue'}]},'fake'
    app.config['LLM']=PickingExternal()
    result=c.post('/api/catalog/recommendations',json={'mood':'adventurous','length':'short'}).get_json()
    assert result['items'] and all(book['id']!=external for book in result['items'])
    assert source.calls==0

def test_partial_question_coverage_excludes_book_from_all_flows(strict):
    app,c,source,external=strict
    alice=c.get('/api/catalog/search?q=alice').get_json()['items'][0]
    with app.app_context():
        con=db.get_db();slug=con.execute('SELECT slug FROM catalog_books WHERE id=?',(alice['id'],)).fetchone()['slug']
        con.execute('DELETE FROM chapter_questions WHERE catalog_slug=? AND chapter_number=12',(slug,));con.commit()
    assert c.get('/api/catalog/search?q=alice').get_json()['items']==[]
    assert c.get(f"/api/catalog/{alice['id']}").status_code==404
    assert c.post('/api/books',json={'catalogId':alice['id']}).status_code==400
    result=c.post('/api/catalog/recommendations',json={'mood':'adventurous','length':'short'}).get_json()
    assert all(book['id']!=alice['id'] for book in result['items'])


def test_every_visible_book_has_three_questions_for_each_chapter(strict):
    app,c,source,external=strict
    with app.app_context():
        con=db.get_db();books=catalog.approved_rows(con)
        assert books
        for book in books:
            chapters=json.loads(book['chapters'])
            for n in range(1,len(chapters)+1):
                assert con.execute('SELECT COUNT(*) FROM chapter_questions WHERE catalog_slug=? AND chapter_number=?',(book['slug'],n)).fetchone()[0]==3
