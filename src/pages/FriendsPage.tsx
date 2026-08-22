import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageIntro } from '../components/AppShell';
import { friends as initialFriends } from '../data/demo';

export function FriendsPage(){
  const [query,setQuery]=useState('');
  const [request,setRequest]=useState<'pending'|'accepted'|'declined'>('pending');
  const [notice,setNotice]=useState('');
  const results=useMemo(()=>initialFriends.filter(friend=>`${friend.name} ${friend.username}`.toLowerCase().includes(query.toLowerCase())),[query]);
  return <div className="stack-xl friends-pro"><PageIntro eyebrow="COMMUNITY" title="Train alongside your people" copy="Friendships are mutual. Progress stays private until you choose exactly what to share."/>
    <form className="search-box" onSubmit={e=>{e.preventDefault();setNotice(query?`${results.length} matching athlete${results.length===1?'':'s'}`:'Enter a name or username')}}><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by name or username"/><button>Search</button></form>{notice&&<div className="inline-notice">{notice}</div>}
    {request==='pending'&&<section><div className="section-row"><h3>Friend requests</h3><span className="count">1</span></div><div className="request-card"><span className="avatar blue">ML</span><div><strong>Morgan Lee</strong><small>@morgantrains · 3 mutual friends</small></div><button className="button small-button" onClick={()=>{setRequest('accepted');setNotice('Morgan is now in your training circle.')}}>Accept</button><button className="button ghost small-button" onClick={()=>{setRequest('declined');setNotice('Request declined.')}}>Decline</button></div></section>}
    <section><div className="section-row"><h3>Your friends</h3><span className="muted">{results.length} shown</span></div><div className="friends-grid">{results.map(friend=><article className="friend-card" key={friend.username}><div className="friend-top"><span className="avatar" style={{background:friend.accent,color:'#08110e'}}>{friend.initials}</span><span className="status-dot">{friend.status}</span></div><h3>{friend.name}</h3><p>@{friend.username}</p><div className="friend-stats"><span><strong>{friend.sessions}</strong>sessions / week</span><span><strong>{friend.total}</strong>strength total</span></div><div className="button-row"><Link className="button secondary small-button" to={`/insights/compare?friend=${friend.username}`}>Compare</Link><button className="button ghost small-button" onClick={()=>setNotice(`Sharing controls for ${friend.name} will open from their profile in the connected app.`)}>Sharing</button></div></article>)}</div>{results.length===0&&<div className="empty-friends"><strong>No athletes found</strong><span>Try a different name or username.</span></div>}</section>
  </div>;
}
