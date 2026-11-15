"""Native Gemini transport and recap integration. All HTTP is mocked."""
import sys
from pathlib import Path
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import llm
from app import create_app

class Response:
    def __init__(self, status, data):
        self.status_code, self.data = status, data
    def json(self):
        if isinstance(self.data, Exception):
            raise self.data
        return self.data

def answer(text='{"recap":"The lantern lit the path.","nudge":"Read on."}', **extra):
    return {'candidates': [{'content': {'parts': [{'text': text}]}, 'finishReason': 'STOP', **extra}]}

class Session:
    def __init__(self, *responses):
        self.responses, self.calls = list(responses), []
    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        result = self.responses.pop(0)
        if isinstance(result, Exception):
            raise result
        return result

@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for key in ['LLM_PROVIDER','GEMINI_API_KEY','GEMINI_MODELS','OPENROUTER_API_KEY','LLM_MODELS','LLM_TIMEOUT_SECONDS']:
        monkeypatch.delenv(key, raising=False)

def test_native_request_and_json_parts():
    data = answer()
    data['candidates'][0]['content']['parts'] = [{'text':'reasoning','thought':True},{'text':'{"recap":'},{'text':'"A lantern."}'}]
    session = Session(Response(200, data))
    result, model = llm.GeminiClient('test-key',['models/gemini-test'],session=session).complete_json('system','story',800,.4)
    assert result == {'recap':'A lantern.'}
    assert model == 'models/gemini-test'
    url, request = session.calls[0]
    assert url == f'{llm.GEMINI_URL}/gemini-test:generateContent'
    assert 'test-key' not in url
    assert request['headers'] == {'x-goog-api-key':'test-key'}
    assert request['json'] == {
        'systemInstruction':{'parts':[{'text':'system'}]},
        'contents':[{'role':'user','parts':[{'text':'story'}]}],
        'generationConfig':{'responseMimeType':'application/json','maxOutputTokens':800,'temperature':.4},
    }
    assert request['timeout'] == 20

def test_rate_limit_fallback_and_cooldown():
    session = Session(Response(429,{}),Response(200,answer()),Response(200,answer()))
    client = llm.GeminiClient('key',['first','second'],session=session)
    assert client.complete_json('s','u')[1] == 'second'
    assert client.complete_json('s','u')[1] == 'second'
    assert [url.split('/')[-1] for url,_ in session.calls] == ['first:generateContent','second:generateContent','second:generateContent']

@pytest.mark.parametrize('response',[
    Response(403,{'error':{'message':'denied'}}),
    Response(200,{'promptFeedback':{'blockReason':'SAFETY'}}),
    Response(200,answer('',finishReason='MAX_TOKENS')),
    Response(200,answer('not JSON')),Response(200,answer('')),
    Response(502,ValueError('not JSON')),TimeoutError('timeout'),
])
def test_failures_follow_existing_fallback_contract(response):
    with pytest.raises(llm.LLMError):
        llm.GeminiClient('key',session=Session(response)).complete_json('s','u')

def test_provider_selection_and_model_isolation(monkeypatch):
    assert llm.client_from_env() is None
    monkeypatch.setenv('OPENROUTER_API_KEY','old-key')
    monkeypatch.setenv('LLM_MODELS','old-router-model')
    assert type(llm.client_from_env()) is llm.OpenRouterClient
    monkeypatch.setenv('GEMINI_API_KEY','new-key')
    assert type(llm.client_from_env()) is llm.GeminiClient
    assert llm.client_from_env().models == llm.DEFAULT_GEMINI_MODELS
    monkeypatch.setenv('GEMINI_MODELS','first, models/second')
    assert llm.client_from_env().models == ['first','models/second']
    monkeypatch.setenv('LLM_PROVIDER','gemini')
    monkeypatch.delenv('GEMINI_API_KEY')
    assert llm.client_from_env() is None
    monkeypatch.setenv('LLM_PROVIDER','typo')
    with pytest.raises(ValueError,match='LLM_PROVIDER'):
        llm.client_from_env()

def test_gemini_writes_and_caches_checkpoint_recap(tmp_path):
    session = Session(Response(200,answer()))
    client = llm.GeminiClient('key',session=session)
    app = create_app({'TESTING':True,'DATABASE':str(tmp_path/'gemini.db'),'LLM':client,'LLM_ASYNC':False})
    api = app.test_client()
    book = api.post('/api/books',json={'title':'A Quest','chapters':['One','Two','Three']}).get_json()['id']
    api.post(f'/api/books/{book}/checkpoints',json={'completed':1,'note':'A lantern.'})
    recap = api.post(f'/api/books/{book}/recap').get_json()
    assert recap['source'] == 'llm'
    assert recap['recap'] == 'The lantern lit the path.'
    assert recap['model'] == llm.DEFAULT_GEMINI_MODELS[0]
    assert api.post(f'/api/books/{book}/recap').get_json() == recap
    assert len(session.calls) == 1
