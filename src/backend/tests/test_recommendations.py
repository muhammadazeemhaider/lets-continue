"""Catalogue recommendations stay grounded in saved entries and fail gracefully."""
import json
import sys
from pathlib import Path
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import create_app

class Guide:
    models=['fake']
    def __init__(self, fail=False):self.calls=[];self.fail=fail
    def complete_json(self,system,user,**kwargs):
        self.calls.append((system,json.loads(user)))
        if self.fail:raise RuntimeError('offline')
        books=self.calls[-1][1]['catalogue']
        bid=books[0]['catalogId']
        return {'picks':[{'catalogId':999999,'reason':'Invented'},{'catalogId':bid,'reason':'A possible match for your adventurous mood.'},{'catalogId':bid,'reason':'Duplicate'}]},'fake'

@pytest.fixture
def setup(tmp_path):
    def make(client=None):
        app=create_app({'TESTING':True,'DATABASE':str(tmp_path/'recommend.db'),'LLM':client,'LOAD_BUNDLED_CATALOG':True})
        return app.test_client()
    return make

ANSWERS={'mood':'adventurous','length':'short','favorites':'I enjoyed The Hobbit.'}

def test_recommendations_validate_ids_and_exclude_owned_books(setup):
    guide=Guide();api=setup(guide)
    api.post('/api/books',json={'title':'Dune','chapterCount':10})
    result=api.post('/api/catalog/recommendations',json=ANSWERS)
    assert result.status_code==200
    data=result.get_json()
    assert data['personalized'] is True and len(data['items'])==1
    assert data['items'][0]['title']!='Dune'
    assert data['items'][0]['chapters']
    assert all(b['title']!='Dune' for b in guide.calls[0][1]['catalogue'])
    assert guide.calls[0][1]['preferences']==ANSWERS
    assert api.get(f"/api/catalog/{data['items'][0]['id']}").status_code==200

@pytest.mark.parametrize('client',[None,Guide(fail=True)])
def test_no_ai_returns_honestly_labelled_catalogue_suggestions(setup,client):
    data=setup(client).post('/api/catalog/recommendations',json=ANSWERS).get_json()
    assert data['source']=='catalog' and data['personalized'] is False
    assert len(data['items'])==3

@pytest.mark.parametrize('body',[{}, {**ANSWERS,'mood':'invalid'}, {**ANSWERS,'length':5}, {**ANSWERS,'favorites':'x'*501}, {**ANSWERS,'favorites':[]}])
def test_invalid_preferences_rejected(setup,body):
    assert setup().post('/api/catalog/recommendations',json=body).status_code==400

def test_extended_preferences_reach_the_guide(setup):
    guide=Guide();api=setup(guide)
    answers={**ANSWERS,'genre':'fantasy','difficulty':'easy','avoid':'Graphic violence'}
    assert api.post('/api/catalog/recommendations',json=answers).status_code==200
    assert guide.calls[0][1]['preferences']==answers

@pytest.mark.parametrize('extra',[{'genre':'wrong'},{'difficulty':[]},{'avoid':5},{'avoid':'x'*501}])
def test_extended_preferences_are_validated(setup,extra):
    assert setup().post('/api/catalog/recommendations',json={**ANSWERS,**extra}).status_code==400

@pytest.mark.parametrize('completed',[0,3,10])
@pytest.mark.parametrize('use_ai',[False,True])
def test_unread_reading_and_completed_books_are_never_recommended(setup,completed,use_ai):
    guide=Guide() if use_ai else None
    api=setup(guide)
    bid=api.post('/api/books',json={'title':'DUNE: Illustrated Edition','chapterCount':10}).get_json()['id']
    if completed:
        api.post(f'/api/books/{bid}/checkpoints',json={'completed':completed})
    result=api.post('/api/catalog/recommendations',json=ANSWERS).get_json()
    assert all(b['title']!='Dune' for b in result['items'])
    if guide:
        assert all(b['title']!='Dune' for b in guide.calls[0][1]['catalogue'])


def test_title_variants_preserve_sequels():
    from recommendations import title_key
    assert title_key('The Hobbit: An Unexpected Journey')==title_key('hobbit')
    assert title_key('Dune (Illustrated Edition)')==title_key('Dune')
    assert title_key('Dune Messiah')!=title_key('Dune')


def test_book_added_while_ai_is_thinking_is_filtered(setup):
    class ChangingGuide(Guide):
        def complete_json(self,system,user,**kwargs):
            response,model=super().complete_json(system,user,**kwargs)
            chosen=self.calls[-1][1]['catalogue'][0]
            api.post('/api/books',json={'title':chosen['title'],'chapterCount':3})
            return response,model
    guide=ChangingGuide();api=setup(guide)
    result=api.post('/api/catalog/recommendations',json=ANSWERS).get_json()
    added=guide.calls[0][1]['catalogue'][0]['title']
    assert all(book['title']!=added for book in result['items'])
